-- AlterTable
ALTER TABLE "Tasks" ADD COLUMN     "backendBugCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "databaseBugCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "frontendBugCount" INTEGER NOT NULL DEFAULT 0;
