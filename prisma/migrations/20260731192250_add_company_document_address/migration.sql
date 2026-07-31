-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "city" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "document" TEXT,
ADD COLUMN     "documentType" TEXT DEFAULT 'cpf',
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "serviceMode" TEXT DEFAULT 'whatsapp',
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "zipCode" TEXT;
