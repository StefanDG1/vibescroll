type Box = { left: number; top: number; width: number; height: number };
export type ConnectorPath = { id: string; d: string };

export function branchConnectorPaths(
  frame: Box,
  parent: Box,
  children: { id: string; box: Box }[],
  evidence?: Box,
): ConnectorPath[] {
  const x = parent.left + parent.width / 2 - frame.left;
  const targets = children.map(({ id, box }) => ({
    id,
    x: box.left + box.width / 2 - frame.left,
    y: box.top - frame.top,
  }));
  if (evidence)
    targets.push({
      id: "evidence",
      x: evidence.left + evidence.width / 2 - frame.left,
      y: evidence.top + 18 - frame.top,
    });
  return targets.map((target) => ({
    id: target.id,
    d: `M ${x} 0 V ${target.y / 2} H ${target.x} V ${target.y}`,
  }));
}

export function syncConnectorPaths(
  svg: SVGSVGElement,
  frame: Box,
  paths: ConnectorPath[],
) {
  const viewBox = `0 0 ${Math.max(1, frame.width)} ${Math.max(1, frame.height)}`;
  if (svg.getAttribute("viewBox") !== viewBox)
    svg.setAttribute("viewBox", viewBox);
  const existing = new Map(
    [...svg.querySelectorAll("path")].map((path) => [
      path.getAttribute("data-connector-id"),
      path,
    ]),
  );
  for (const { id, d } of paths) {
    let path = existing.get(id);
    if (!path) {
      path = svg.ownerDocument.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("data-connector-id", id);
      svg.append(path);
    }
    if (path.getAttribute("d") !== d) path.setAttribute("d", d);
    existing.delete(id);
  }
  for (const path of existing.values()) path.remove();
}

export function measureTreeConnectors(tree: HTMLElement) {
  for (const svg of tree.querySelectorAll<SVGSVGElement>(
    "svg[data-connector-parent]",
  )) {
    const level = svg.closest<HTMLElement>(".hybrid-tree-level");
    const row = level?.querySelector<HTMLElement>(
      ":scope > .hybrid-node-level",
    );
    const parent = [
      ...(row?.querySelectorAll<HTMLElement>(".hybrid-node") ?? []),
    ].find((node) => node.dataset.topicId === svg.dataset.connectorParent);
    const frame = svg.parentElement;
    if (!parent || !frame) {
      syncConnectorPaths(svg, { left: 0, top: 0, width: 1, height: 1 }, []);
      continue;
    }
    const bounds = frame.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    if (svg.classList.contains("hybrid-parent-stem")) {
      const x = p.left + p.width / 2 - bounds.left;
      syncConnectorPaths(svg, bounds, [
        {
          id: "stem",
          d: `M ${x} ${p.bottom - bounds.top} V ${bounds.height}`,
        },
      ]);
    } else {
      const children = [
        ...frame.querySelectorAll<HTMLElement>(
          ":scope > .hybrid-tree-level > .hybrid-node-level > .hybrid-node-row > li > .hybrid-node-card > .hybrid-node",
        ),
      ].map((node) => ({
        id: node.dataset.topicId!,
        box: node.getBoundingClientRect(),
      }));
      const evidence = frame.querySelector<HTMLElement>(
        ":scope > .hybrid-evidence",
      );
      syncConnectorPaths(
        svg,
        bounds,
        branchConnectorPaths(
          bounds,
          p,
          children,
          evidence?.getBoundingClientRect(),
        ),
      );
    }
  }
}
