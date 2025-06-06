import prisma from "../prismaClient.js";

const defaultValues = [
    {name: 'To Do', type: 'To_Do', color: '#90a9d0'},
    {name: 'In Progress', type: 'In_Progress', color: '#f9d171'},
    {name:"Bug", type:"In_Progress", color: "#DC2626"},
    {name: 'Completed', type: 'Completed', color: '#008844'},
]
const statusOrder = {
    "Completed": 0,
    "In_Progress": 1,
    "To_Do": 2
};

const projectTaskCountByStatus = async (id, statusType) => {
    const count = await prisma.tasks.count({
        where: {
            sprint: {
                project_id: id
            },
            status: {
                type: statusType
            }
        }
    });
    return count;
}

const projectTaskCountByPriority = async (id,priority) => {
    const count = await prisma.tasks.count({
        where: {
            priority: priority,
            sprint: {
                project_id: id
            },
        }
    })
    return count;
}
export const createProject = async (req, res) => {
    try {
        const {name, startDate, dueDate, workspaceId, customStatus} = req.body;

        if (!name || !startDate || !dueDate || !workspaceId) {
            return res.status(400).send({message: 'Missing required fields'});
        }

        // Start a transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Create project
            const project = await prisma.project.create({
                data: {
                    name,
                    dueDate: new Date(dueDate),
                    startDate: new Date(startDate),
                    workspace_id: parseInt(workspaceId),
                },
            });

            if (!project) throw new Error("Error creating project");

            // Prepare statuses
            const statusList = (customStatus && customStatus.length > 0 ? customStatus : defaultValues).map(({ id, ...status }) => ({
                project_id: project.id,
                ...status,
            }));

            // Create statuses
            await prisma.status.createMany({
                data: statusList
            });

            // Assign Project Manager
            await prisma.project_User.create({
                data: {
                    project_id: project.id,
                    user_id: req.userId,
                    role: "Project_Manager"
                }
            });

            return {project, statusList};
        });

        return res.status(200).send({
            message: 'Successfully created project',
            project: result.project,
            statusList: result.statusList
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send({message: 'Failed to create project'});
    }
};

export const updateStatus = async (req, res) => {
    try {
        const {customStatus} = req.body;
        console.log(customStatus);
        const {projectId} = req.params;
        const operations = customStatus?.map((status) => {
            const data = {
                name: status.name,
                type: status.type,
                color: status.color,
            };

            if (status.id) {
                if (!status.name) {
                    return prisma.status.delete({
                        where: {
                            id: status.id,
                        }
                    })
                }
                return prisma.status.update({
                    where: {id: status.id},
                    data,
                });
            } else {
                if (!status.name) return
                return prisma.status.create({
                    data: {
                        ...data,
                        project_id: parseInt(projectId),
                    },
                });
            }
        });

        await Promise.all(operations);
        return res.status(200).send({message: 'Status updated successfully'});
    } catch (err) {
        console.error(err);
        return res.status(500).send({message: 'Failed to update status'});
    }

}
export const getProjects = async (req, res) => {
    const {workspaceId} = req.params;
    try {
        const projects = await prisma.project.findMany({
            where: {
                workspace_id: parseInt(workspaceId),
                users: {
                    some: {
                        user_id: req.userId,
                    }
                }
            }, include: {
                sprint: true,
                users:true
            }
        })
        const projectsWithTaskCounts = await Promise.all(
            projects.map(async (project) => {
                const toDoTasks = await projectTaskCountByStatus(project.id, 'To_Do')

                const inProgressTasks = await projectTaskCountByStatus(project.id, 'In_Progress')

                const completedTasks = await projectTaskCountByStatus(project.id, 'Completed')

                return {
                    ...project,
                    toDo: toDoTasks,
                    inProgress: inProgressTasks,
                    completed: completedTasks,
                    tasks: toDoTasks + inProgressTasks + completedTasks,
                    role:project.users.filter(user => user.user_id === req.userId)[0].role
                };
            })
        );
        return res.status(200).send(projectsWithTaskCounts)
    } catch (err) {
        console.error(err);
        return res.status(500).send({message: 'No projects found'});
    }
}

export const createSprint = async (req, res) => {
    try {
        const {name, startDate, dueDate, project_id} = req.body;
        const projectId = parseInt(project_id);
        // Check for missing fields
        if (!name || !startDate || !dueDate || !project_id) {
            return res.status(400).json({message: 'Missing required fields'});
        }

        // Validate date range
        if (new Date(startDate) >= new Date(dueDate)) {
            return res.status(400).json({message: 'Start date must be before due date'});
        }

        // Check if the project exists
        const project = await prisma.project.findUnique({where: {id: projectId}});
        if (!project) {
            return res.status(404).json({message: 'Project not found'});
        }

        // Create the sprint
        const sprint = await prisma.sprint.create({
            data: {name, startDate, endDate: dueDate, project_id: projectId},
        });

        return res.status(201).json({
            message: 'Successfully created project',
            sprint
        });

    } catch (err) {
        console.error('Error creating sprint:', err);
        return res.status(500).json({message: 'Failed to create Sprint', error: err.message});
    }
};

export const getProjectDetails = async (req, res) => {
    try {
        const {projectId} = req.params;
        const projectData = await prisma.project.findUnique({
            where: {id: parseInt(projectId)},
            include: {
                status: true,
                sprint: {
                    include: {
                        Tasks: {
                            include: {
                                Task_User: {
                                    include: {
                                        user: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        if (!projectData) {
            return res.status(422).json({message: 'Project not found'});
        }
        const toDoTasks = await projectTaskCountByStatus(projectData.id, 'To_Do')

        const inProgressTasks = await projectTaskCountByStatus(projectData.id, 'In_Progress')

        const completedTasks = await projectTaskCountByStatus(projectData.id, 'Completed')
        const lowPriorityTask = await projectTaskCountByPriority(projectData.id,'Low')
        const highPriorityTask = await projectTaskCountByPriority(projectData.id,'High')
        const mediumPriorityTask = await projectTaskCountByPriority(projectData.id,'Medium')
        const memberCount = await prisma.project_User.count({
            where: {
                project_id: projectData.id,
            }
        })
        const projectOverviewData = {
            id: projectData.id,
            name: projectData.name,
            startDate: projectData.startDate,
            updatedAt: projectData.updatedAt,
            dueDate: projectData.dueDate,
            toDo: toDoTasks,
            inProgress: inProgressTasks,
            completed: completedTasks,
            tasks: toDoTasks + inProgressTasks + completedTasks,
            highPriority: highPriorityTask,
            lowPriority: lowPriorityTask,
            mediumPriority: mediumPriorityTask,
            members: memberCount,
        }
        const projectSprintSummary = projectData.sprint.map((sprint) => ({
            id: sprint.id,
            name: sprint.name,
            taskStatus: projectData.status.map((status) => ({
                name: status.name,
                type: status.type,
                color: status.color,
                tasks: sprint.Tasks
                    .filter((task) => task.status_id === status.id)
                    .map((task) => ({
                        id: task.id,
                        name: task.name,
                        assignees: task.Task_User.map((taskUser) => ({
                            id: taskUser.user.id,
                            username: taskUser.user.username,
                            email: taskUser.user.email,
                            image: taskUser.user.imageUrl,
                            avatarColor: taskUser.user.avatarColor
                        })),
                        bugCount: task.frontendBugCount + task.backendBugCount + task.databaseBugCount,
                        priority: task.priority
                    }))
            })).sort((a, b) => statusOrder[a.type] - statusOrder[b.type])
        }));
        return res.status(200).send({
            projectOverviewData,
            projectSprintSummary,
        })
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Failed to get project tasks'});
    }
}

export const getSprintTasks = async (req, res) => {
    try {
        const {sprintId} = req.params;
        const sprintData = await prisma.sprint.findUnique({
            where: {id: parseInt(sprintId)},
            include: {
                Tasks: {
                    include: {
                        Task_User: {
                            include: {
                                user: true,
                            }
                        }
                    }
                }
            }
        })
        const project = await prisma.project.findUnique({
            where: {id: sprintData.project_id},
            include: {
                status: true
            },
        })
        const taskStatus = project.status.map((status) => ({
            id: status.id,
            name: status.name,
            type: status.type,
            color: status.color,
            tasks: sprintData.Tasks.filter((task) => task.status_id === status.id)
                .map((task) => ({
                    id: task.id,
                    name: task.name,
                    assignees: task.Task_User.map((taskUser) => ({
                        id: taskUser.user.id,
                        username: taskUser.user.username,
                        email: taskUser.user.email,
                        image: taskUser.user.imageUrl,
                        avatarColor: taskUser.user.avatarColor
                    })),
                    bugCount: task.frontendBugCount + task.backendBugCount + task.databaseBugCount,
                    priority: task.priority
                }))
        })).sort((a, b) => statusOrder[a.type] - statusOrder[b.type])
        return res.status(200).send({taskStatus})
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Failed to get sprint tasks'});
    }
}

export const getProjectStatusMembers = async (req, res) => {
    const {projectId} = req.params;
    try {
        const project = await prisma.project.findUnique({
            where: {id: parseInt(projectId)},
            select: {
                name: true,
                idealTaskCount: true,
            }
        })
        if (!project) {
            return res.status(422).send({message: 'Something went wrong!'});
        }
        const projectStatus = await prisma.status.findMany({
            where: {project_id: parseInt(projectId)},
            select: {
                id: true,
                name: true,
                type: true,
                color: true,
            }
        })
        const projectMembers = await prisma.user.findMany({
            where: {
                projects: {
                    some: {
                        project_id: parseInt(projectId),
                    },
                },
            },
            select: {
                id: true,
                imageUrl: true,
                avatarColor: true,
                username: true,
            },
        });
        projectStatus.sort((a, b) => {
            return statusOrder[b.type] - statusOrder[a.type];
        });

        return res.status(200).send({name:project.name,idealTaskCount:project.idealTaskCount,projectStatus, projectMembers})
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Failed to get project status members'});
    }
}
export const updateProject = async (req, res) => {
   try {
       const project = await prisma.project.findUnique({
           where:{
               id: parseInt(req.params.projectId),
           }
       })
       if (!project) {
           return res.status(422).send({message: 'Something went wrong!'});
       }
        const updateProject = await prisma.project.update({
            where: {id: parseInt(req.params.projectId)},
            data: {
                ...req.body,
            }
        })
       return  res.status(200).send({message: 'Successfully updated project task',updateProject});
   }catch (err) {
       console.error(err);
       return res.status(500).json({message: 'Failed to update project'});
   }
}
export const getProjectMembers = async (req, res) => {
    const {projectId} = req.params;
    try {
        const projectMembers = await prisma.project_User.findMany({
            where: {project_id: parseInt(projectId)},
            select: {
                joinDate: true,
                role: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        imageUrl: true,
                        avatarColor: true,
                        username: true,
                    }
                }
            }
        })
        const project = await prisma.project.findUnique({
            where: {id: parseInt(projectId)},
            select: {
                workspace_id: true
            }
        })
        const projectMemberIds = projectMembers.map((pm) => pm.user.id);
        const workspaceMembers = await prisma.workspace_User.findMany({
            where: {
                workspace_id: project.workspace_id,
                user_id: {
                    notIn: projectMemberIds,
                },
            },
            select: {
                role: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        imageUrl: true,
                        avatarColor: true,
                        username: true,
                    },
                }
            }
        })
        const currentMembers = projectMembers.map(u => {
            return {
                id: u.user.id,
                name: u.user.username,
                email: u.user.email,
                joinDate: u.joinDate.toISOString().split('T')[0],
                role: u.role,
                avatarColor: u.user.avatarColor,
                imageUrl: u.user.imageUrl,

            }
        })
        const remainingMembers = workspaceMembers.map((u) => {
            return {
                id: u.user.id,
                username: u.user.username,
                email: u.user.email,
                avatarColor: u.user.avatarColor,
                imageUrl: u.user.imageUrl,
            }
        })
        const userRole = projectMembers.find(u => u.user.id === req.userId)?.role
        return res.status(200).send({currentMembers, remainingMembers, userRole})
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Failed to get project members'});
    }
}
export const projectRetrospective = async (req, res) => {
    try {
        const {workspaceId} = req.params;
        const projects = await prisma.project.findMany({
            where: {
                workspace_id: parseInt(workspaceId),
                users: {
                    some: {
                        user_id: req.userId
                    }
                }
            },
            select: {
                id: true,
                name: true,
                sprint: {
                    select: {
                        id: true,
                        name: true,
                        endDate:true
                    }
                },
                users: {
                    where: {
                        user_id: req.userId
                    },
                    select: {
                        role: true
                    }
                }
            }
        })
        return res.status(200).json({projects})

    } catch (error) {
        console.log(error);
        return res.status(500).json({message: 'Internal Server Error'});

    }
}

export const createSprintRetrospective = async (req, res) => {
    try {
        const {sprintId, ...retrospective} = req.body;
        const sprint = await prisma.sprint.findUnique({
            where: {
                id: parseInt(sprintId)
            }
        })
        if (!sprint) {
            return res.status(422).json({message: 'Sprint not found'});
        }
        const retrospectiveData = await prisma.sprint_Feedback.create({
            data: {
                sprint_id: parseInt(sprintId),
                ...retrospective
            }
        })
        return res.status(200).json({message: 'Successfully submitted', retrospectiveData})
    } catch (error) {
        console.log(error);
        return res.status(500).json({message: 'Internal Server Error'});

    }
}
export const getRetroFeedbacks = async (req, res) => {
    try {
        const {sprintId} = req.params;
        const responses = await prisma.sprint_Feedback.findMany({
            where: {
                sprint_id: parseInt(sprintId)
            },
        })
        if (!responses) {
            return res.status(422).json({message: 'Failed to get feedbacks'});
        }
        return res.status(200).json({responses})
    } catch (err) {
        console.log(err);
        return res.status(500).json({message: 'Internal Server Error'});
    }
}

export const addProjectMembers = async (req, res) => {
    try{
     const members = req.body;
    const {projectId} = req.params;
    const id = parseInt(projectId);
    const newMembers = members.map((member) => ({
        project_id : id,
        user_id: member
    }))
        const updatedMembers = await prisma.project_User.createMany({
            data:newMembers
        })
     return res.status(200).json({message: 'Successfully added members', members})
    }catch (error) {
        console.log(error);
        return res.status(500).json({message: 'Internal Server Error'});
    }
}

export const updateMemberRole = async (req, res) => {
    try {
        const {memberId, role} = req.body;
        const {projectId} = req.params;
        if (!memberId || !role) {
            return res.status(422).json({message: 'Failed to update the role'});
        }
        if(role === "Remove"){
            await prisma.project_User.deleteMany({
                where: {
                    user_id: parseInt(memberId),
                    project_id: parseInt(projectId)
                }
            });
            await prisma.task_User.deleteMany({
                where: {
                    user_id: parseInt(memberId),
                    task: {
                        sprint: {
                            project_id: parseInt(projectId)
                        }
                    }
                }
            })
        return res.status(200).json({message: 'Successfully removed member'})
        }
        await prisma.project_User.update({
            data: {
                role: role,
            },
            where: {
                project_id_user_id: {
                    project_id: parseInt(projectId),
                    user_id: parseInt(memberId),
                },
            }
        })
        return res.status(200).json({message: `Successfully updated member's role`})
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({message: 'Internal Server Error'});
    }
}

export const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        
        await prisma.$transaction(async (prisma) => {
            // Delete all comments from tasks in this project
            await prisma.task_Comment.deleteMany({
                where: {
                    task: {
                        sprint: {
                            project_id: parseInt(projectId)
                        }
                    }
                }
            });

            // Delete all task-user associations
            await prisma.task_User.deleteMany({
                where: {
                    task: {
                        sprint: {
                            project_id: parseInt(projectId)
                        }
                    }
                }
            });

            // Delete all tasks
            await prisma.tasks.deleteMany({
                where: {
                    sprint: {
                        project_id: parseInt(projectId)
                    }
                }
            });

            // Delete sprint feedbacks
            await prisma.sprint_Feedback.deleteMany({
                where: {
                    sprint: {
                        project_id: parseInt(projectId)
                    }
                }
            });

            // Delete all sprints
            await prisma.sprint.deleteMany({
                where: {
                    project_id: parseInt(projectId)
                }
            });

            // Delete project status
            await prisma.status.deleteMany({
                where: {
                    project_id: parseInt(projectId)
                }
            });

            // Delete project-user associations
            await prisma.project_User.deleteMany({
                where: {
                    project_id: parseInt(projectId)
                }
            });

            // Finally delete the project
            await prisma.project.delete({
                where: {
                    id: parseInt(projectId)
                }
            });
        });
        
        return res.status(200).json({ message: 'Project and all associated data deleted successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};