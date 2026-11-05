/** Positions for the decision tree map: one column per depth from the start. */
export interface TreeNode {
  id: string;
  kind: 'step' | 'end';
  title: string;
  text: string;
  choices: { id: string; text: string; feedback: string; targetId: string }[];
  score?: number;
}

export interface PlacedNode {
  node: TreeNode;
  x: number;
  y: number;
  /** Not reachable from the start. */
  detached: boolean;
}

export interface TreeEdge {
  key: string;
  path: string;
  label: string;
  /** Points back to an earlier step, as in a retry loop. */
  back: boolean;
}

export interface TreeLayout {
  placed: PlacedNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
}

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 64;
const GAP_X = 64;
const GAP_Y = 16;
const PADDING = 12;

export function layoutTree(nodes: TreeNode[], startId: string): TreeLayout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const column = new Map<string, number>();
  const start = byId.get(startId);
  const queue: TreeNode[] = start ? [start] : [];
  if (start) column.set(start.id, 0);

  // Breadth first, so a step sits at its shortest distance from the start.
  while (queue.length) {
    const node = queue.shift()!;
    for (const choice of node.choices) {
      const target = byId.get(choice.targetId);
      if (target && !column.has(target.id)) {
        column.set(target.id, column.get(node.id)! + 1);
        queue.push(target);
      }
    }
  }

  const rows: number[] = [];
  const position = new Map<string, PlacedNode>();
  const place = (node: TreeNode, col: number, detached: boolean) => {
    const row = (rows[col] = (rows[col] ?? -1) + 1);
    position.set(node.id, { node, x: PADDING + col * (NODE_WIDTH + GAP_X), y: PADDING + row * (NODE_HEIGHT + GAP_Y), detached });
  };
  for (const node of nodes) {
    if (column.has(node.id)) place(node, column.get(node.id)!, false);
  }
  const lastColumn = rows.length;
  for (const node of nodes) {
    if (!column.has(node.id)) place(node, lastColumn, true);
  }

  const edges: TreeEdge[] = [];
  for (const node of nodes) {
    const from = position.get(node.id)!;
    for (const choice of node.choices) {
      const to = position.get(choice.targetId);
      if (!to) continue;
      const back = to.x <= from.x;
      const y1 = from.y + NODE_HEIGHT / 2;
      const y2 = to.y + NODE_HEIGHT / 2;
      let path: string;
      if (back) {
        // Loop under the boxes, so it does not run through them.
        const dip = Math.max(from.y, to.y) + NODE_HEIGHT + GAP_Y / 2;
        path = `M ${from.x + NODE_WIDTH / 2} ${from.y + NODE_HEIGHT} C ${from.x + NODE_WIDTH / 2} ${dip}, ${to.x + NODE_WIDTH / 2} ${dip}, ${to.x + NODE_WIDTH / 2} ${to.y + NODE_HEIGHT}`;
      } else {
        const x1 = from.x + NODE_WIDTH;
        const x2 = to.x;
        const middle = (x1 + x2) / 2;
        path = `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
      }
      edges.push({ key: choice.id, path, label: choice.text, back });
    }
  }

  const placed = [...position.values()];
  return {
    placed,
    edges,
    width: Math.max(...placed.map((p) => p.x), 0) + NODE_WIDTH + PADDING,
    height: Math.max(...placed.map((p) => p.y), 0) + NODE_HEIGHT + PADDING * 2,
  };
}
