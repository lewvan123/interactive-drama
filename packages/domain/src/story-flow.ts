export function isBranchingNode(node: { choices: readonly unknown[] }): boolean {
  return node.choices.length > 1;
}
