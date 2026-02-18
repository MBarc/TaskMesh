import { PrismaClient } from '@prisma/client';

/**
 * Ensure a column of the given type exists on the board.
 * Returns the existing column if found, otherwise creates a new one at the end.
 */
export async function ensureColumn(
  prisma: PrismaClient,
  boardId: string,
  columnType: string,
  columnName: string,
): Promise<any> {
  const existing = await prisma.column.findFirst({
    where: { boardId, type: columnType as any },
    include: { options: { orderBy: { order: 'asc' } } },
  });

  if (existing) return existing;

  const maxOrder = await prisma.column.aggregate({
    where: { boardId },
    _max: { order: true },
  });

  const newOrder = (maxOrder._max.order ?? -1) + 1;

  return prisma.column.create({
    data: {
      boardId,
      name: columnName,
      type: columnType as any,
      order: newOrder,
    },
    include: { options: { orderBy: { order: 'asc' } } },
  });
}

/**
 * Remove a column of the given type from the board.
 * Also deletes all associated cell values (cascade).
 */
export async function removeColumn(
  prisma: PrismaClient,
  boardId: string,
  columnType: string,
): Promise<void> {
  const existing = await prisma.column.findFirst({
    where: { boardId, type: columnType as any },
  });

  if (existing) {
    await prisma.column.delete({ where: { id: existing.id } });
  }
}
