import prisma from "../prismaClient.js";
import {generateInviteCode} from "../utils/inviteCode.generator.js";
import {WORKSPACE_ROLES} from "../constant/role.constants.js";
import {generateWorkspaceInviteEmail} from "../utils/email-template.generator.js";
import {sendEmail} from "../utils/email.service.js";

export const createWorkspace = async (req, res) => {
    const {name, role} = req.body;
    if (!name) {
        return res.status(400).json({message: 'Please provide a workspace name'});
    }
    try {
        const inviteCode = generateInviteCode(7);
        const newWorkspace = await prisma.workspace.create({
            data: {
                name,
                inviteCode,
                users: {
                    create: {
                        user_id: req.userId,
                        role: role
                    }

                }
            }
        })
        return res.status(201).json({message: 'Workspace Created Successfully', newWorkspace});
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
    }
}
export const updateWorkspace = async (req, res) => {
    const {name, id} = req.body;
    if (!name) {
        return res.status(400).json({message: 'Please provide a workspace name'});
    }
    if (!req.isOwner) {
        return res.status(403).json({message: 'You are not authorized to update this workspace'});
    }
    try {
        const updatedWorkspace = await prisma.workspace.update({
            data: {
                name,
            },
            where: {
                id: parseInt(id)
            }
        })
        return res.status(200).json({message: 'Workspace Updated Successfully', updatedWorkspace});
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
    }
}
export const getWorkspaces = async (req, res) => {
    try {
        const workspaces = await prisma.workspace.findMany({
            where: {
                users: {
                    some: {
                        user_id: req.userId,
                    }
                }
            },
            include: {
                users: {
                    where :{
                        user_id: req.userId,
                    },
                    select: { user_id: true, role: true }
                }
            }
        });
        const data = workspaces.map((w) => {
            return {
                id: w.id,
                name: w.name,
                role: w.users[0]?.role  || null
            }
        })
        return res.status(200).json(data);
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
    }
}

export const deleteWorkspace = async (req, res) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId);
        const workspace = await prisma.workspace.findUnique(
            {
                where: {
                    id: workspaceId,
                }
            });
        if (!workspace) {
            return res.status(404).json({message: 'Workspace not found'});
        }
        if (!req.isOwner) {
            return res.status(403).json({message: 'You are not authorized to delete this workspace'});
        }
        // Delete the associated data with the workspace being deleted
        await prisma.workspace_User.deleteMany({
            where: {
                workspace_id: workspaceId,
            }
        })
        await prisma.project_User.deleteMany(
            {
                where: {
                    project: {
                        workspace_id: workspaceId,
                    }
                }
            }
        );
        await prisma.project.deleteMany({
            where: {
                workspace_id: workspaceId,
            }
        });

        await prisma.workspace.delete({
            where: {
                id: workspaceId,
            }
        });

        return res.status(200).json({message: 'Workspace deleted successfully'});
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
    }
}

export const getWorkSpaceAnalytics = async (req, res) => {
    try {
        const id = req.w_id;
        const projectCount = await prisma.project.count({
            where: {
                workspace_id: id
            }
        });
        const userCount = await prisma.workspace_User.count({
            where: {
                workspace_id: id
            }
        })
        const sprintCount = await prisma.sprint.count({
            where: {
                project: {
                    workspace_id: id
                }

            }
        })
        const dueProject = await prisma.project.count({
            where: {
                workspace_id: id,
                dueDate: {
                    gte: new Date(),
                },
            }
        })

        const workspaceAnalytics = {
            Projects: projectCount,
            Members: userCount,
            Sprints: sprintCount,
            "Overdue Projects": dueProject,
        }
        return res.status(200).json({workspaceAnalytics});
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
    }
}

export const getWorkspaceMembers = async (req, res) => {
   try {
       const w_id = req.w_id;
       const user = await prisma.workspace_User.findMany({
           where: {
               workspace_id: w_id,
           }, select: {
               joinDate: true,
               role: true,
               user: {
                   select: {
                       email: true,
                       username: true,
                       id: true,
                   }
               }
           }
       })
       const userList = user.map((u) => {
           return {
               id: u.user.id,
               name: u.user.username,
               email: u.user.email,
               joinDate: u.joinDate.toISOString().split('T')[0],
               role: u.role,


           }
       })
       return res.status(200).json({userList});
   }
   catch (e) {
       console.log(e);
       return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
   }
}
export const leaveWorkspace = async (req, res) => {
    try {
        const workspaceId = parseInt(req.params.workspaceId);
        await prisma.workspace_User.deleteMany({
            where: {
                workspace_id: workspaceId,
                user_id: req.userId
            }
        })
        await prisma.project_User.deleteMany({
            where: {
                project: {
                    workspace_id: workspaceId,
                }
            }
        })
        return res.status(200).json({message: 'Workspace left successfully'});
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
    }
}

export const updateUserRole = async (req, res) => {
    try {
        const {id, newRole} = req.body;

        if (!newRole || !id) {
            return res.status(400).json({ message: 'Invalid request data' });
        }
        if (!WORKSPACE_ROLES.includes(newRole)) {
            return res.status(400).json({ message: 'Invalid role. Please try again' });
        }
        if (!(req.isOwner || req.isAdmin)) {
            return res.status(403).json({ message: 'You do not have permission to change this role' });
        }
        await prisma.workspace_User.update({
            data: {
                role: newRole,
            },
            where: {
                workspace_id_user_id: {
                    workspace_id: req.w_id,
                    user_id: parseInt(id),
                },
            }
        })
        return res.status(200).json({ message: 'User role updated successfully' });
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
    }

}

export const inviteMember = async (req, res) => {
    const {workspaceId} = req.params;
    const {emails} = req.body;

    if (!emails && emails?.length < 1) {
        return res.status(400).json({ message: 'Invalid email address' });
    }

    try {
        const workspace = await prisma.workspace.findUnique({
            where: {
                id: parseInt(workspaceId)
            }
        })
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }
        const emailTemplate = generateWorkspaceInviteEmail(workspace);

        for (let email of emails) {
            await sendEmail('Workspace Invitation', emailTemplate, email);
        }
        return res.status(200).json({message: 'Invitation sent successfully'});
    } catch (e) {
        console.log(e);
        return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
    }

}

export const joinWorkspace = async (req, res) => {
   const {inviteCode} = req.body;
   if (!inviteCode) {
       return res.status(400).json({message: 'Invalid invite Code'});
   }
 try{
     const workspace = await prisma.workspace.findUnique({
         where: {
             inviteCode: inviteCode
         }
     })
     if(!workspace) {
         return res.status(400).json({message: 'Invalid invitation'});
     }
     const existingUser = await prisma.workspace_User.findUnique({
         where: {
             workspace_id_user_id:{
                 workspace_id : workspace.id,
                 user_id : req.userId
             }
         }
     })
     if(existingUser) {
         return res.status(400).json({message: 'User already is part of the workspace'});
     }
   console.log(existingUser);
     const user =await prisma.workspace_User.create({
         data:{
             user_id: req.userId,
             workspace_id : workspace.id,
             role: "Member"
         }
     })
     return res.status(200).json({message: 'Successfully joined workspace',user:user});
 }catch (e) {
       console.log(e);
     return res.status(500).json({ message: 'Something went wrong, please try again later', error: e.message });
 }
}