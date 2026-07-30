/*
  Warnings:

  - A unique constraint covering the columns `[cancelToken]` on the table `Appointment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "cancelToken" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_cancelToken_key" ON "Appointment"("cancelToken");
