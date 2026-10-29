export interface PromotionBlock {
  id: string;
  date: string;
  text: string;
}

export const PROMOTION_MARKER = '<!-- memory:promotion ';

export function promotionEntryOf(block: PromotionBlock): string {
  return `${PROMOTION_MARKER}${block.id} ${block.date} -->\n- ${block.text}`;
}

export function appendPromotionBlock(instructions: string, block: PromotionBlock): string {
  if (instructions.includes(`${PROMOTION_MARKER}${block.id} `)) {
    return instructions;
  }
  const entry = promotionEntryOf(block);
  if (instructions.length === 0) {
    return entry;
  }
  return `${instructions}\n\n${entry}`;
}
