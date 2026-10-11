"use client";
import { useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  BriefcaseBusiness,
  UserRound,
  Package,
  Megaphone,
  UsersRound,
  Tag,
  Folder,
  Code,
  Layers,
} from "lucide-react";
import { motion } from "motion/react";
import {
  buildTopicTree,
  topicPath,
  singleChildTarget,
  type TopicNode,
} from "@/lib/topic-tree";
import { ProposalBubble, ProposalBubbleButton } from "./proposal-bubble";
import { useInterfaceMotion } from "./motion-preference";
import { measureTreeConnectors } from "@/lib/tree-connectors";
type Topic = {
  id: string;
  name: string;
  parentId?: string;
  ideas: number;
  posts: number;
  autoCategory?: boolean;
};
function iconFor(name: string) {
  if (name === "Personal") return UserRound;
  if (name === "Business") return BriefcaseBusiness;
  if (/product/i.test(name)) return Package;
  if (/market|content|conversion/i.test(name)) return Megaphone;
  if (/customer|interface|experience/i.test(name)) return UsersRound;
  if (/pricing/i.test(name)) return Tag;
  if (/engineer|software|code|ai/i.test(name)) return Code;
  return Layers;
}
export function TopicDiagram({
  topics,
  onOpen,
  selectedId,
  representation = "tree",
  filing = "Business",
  children,
  closedTopicId,
  onCollapse,
  proposalCounts,
  onOpenProposals,
}: {
  topics: Topic[];
  proposalCounts?: Record<string, number>;
  onOpenProposals?: (topic: Topic, origin: HTMLButtonElement) => void;
  onOpen: (topic: Topic) => void;
  selectedId?: string;
  representation?: "tree" | "folders";
  filing?: "Personal" | "Business";
  children?: React.ReactNode;
  closedTopicId?: string;
  onCollapse?: (topicId?: string) => void;
  animateEntry?: boolean;
}) {
  const records = new Map(topics.map((t) => [t.id, t]));
  const allRoots = buildTopicTree(topics);
  const organized = allRoots.some(
    (n) =>
      records.get(n.id)?.autoCategory &&
      ["Personal", "Business"].includes(records.get(n.id)!.name),
  );
  const root = allRoots.find(
    (n) =>
      records.get(n.id)?.name === filing && records.get(n.id)?.autoCategory,
  );
  const roots = organized ? (root ? [root] : []) : allRoots;
  const [visualId, setVisualId] = useState(selectedId);
  const [phase, setPhase] = useState<"open" | "closing" | "closed">("open");
  const [cutDepth, setCutDepth] = useState(0);
  const pending = useRef<string | null>(null);
  const switching = useRef(false);
  const closing = useRef(false);
  const previousFiling = useRef(filing);
  const [pointer, setPointer] = useState(false);
  const animate = useInterfaceMotion();
  const duration = animate && pointer ? 0.22 : 0;
  const treeRef = useRef<HTMLElement>(null);
  const start = visualId && records.has(visualId) ? visualId : root?.id;
  const candidate = start ? singleChildTarget(topics, start)?.id : undefined;
  const originalPath = topicPath(topics, candidate ?? "");
  const path = organized
    ? originalPath.filter((_t) => originalPath[0]?.id === root?.id)
    : originalPath;
  const active = new Set(path.map((t) => t.id));
  const syncNavigation = useEffectEvent(() => {
    if (switching.current && previousFiling.current === filing) return;
    previousFiling.current = filing;
    pending.current = null;
    switching.current = false;
    closing.current = false;
    setVisualId(selectedId);
    const restoredTarget = singleChildTarget(
      topics,
      selectedId ?? root?.id ?? "",
    );
    const closedDepth = topicPath(topics, restoredTarget?.id ?? "").findIndex(
      (t) => t.id === closedTopicId,
    );
    setCutDepth(Math.max(0, closedDepth));
    setPhase(closedDepth >= 0 ? "closed" : "open");
  });
  useLayoutEffect(() => {
    syncNavigation();
  }, [selectedId, filing, closedTopicId]);
  useLayoutEffect(() => {
    const tree = treeRef.current;
    if (!tree || representation !== "tree") return;
    let frame = 0;
    function measure() {
      if (!tree) return;
      measureTreeConnectors(tree);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(tree);
    for (const node of tree.querySelectorAll(
      ".hybrid-node-level, .hybrid-branch-content",
    ))
      observer.observe(node);
    const scroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    tree.addEventListener("scroll", scroll, true);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      tree.removeEventListener("scroll", scroll, true);
    };
  }, [visualId, phase, representation, topics, filing, selectedId, children]);
  function finish() {
    if (phase !== "closing" || !closing.current) return;
    // Nested Motion callbacks can finish together. Consume this handoff once.
    closing.current = false;
    if (pending.current) {
      const id = pending.current;
      pending.current = null;
      setVisualId(id);
      setPhase("open");
      const topic = records.get(id);
      if (topic) onOpen(topic);
    } else {
      setPhase("closed");
      onCollapse?.(path[cutDepth]?.id);
    }
    switching.current = false;
  }
  function choose(node: TopicNode, pointerActivation: boolean) {
    setPointer(pointerActivation);
    const shouldAnimate = animate && pointerActivation;
    const topic = records.get(node.id);
    if (!topic) return;
    const target = singleChildTarget(topics, node.id) ?? topic;
    const newPath = topicPath(topics, target.id);
    const depth = Math.max(0, topicPath(topics, node.id).length - 1);
    if (node.id === candidate && phase === "closed") {
      onCollapse?.(undefined);
      setPhase("open");
      return;
    }
    if (active.has(node.id) && phase === "open") {
      pending.current = null;
      setCutDepth(depth);
      if (shouldAnimate) {
        closing.current = true;
        setPhase("closing");
      } else {
        setPhase("closed");
        onCollapse?.(node.id);
      }
      return;
    }
    onCollapse?.(undefined);
    let common = 0;
    while (
      common < path.length &&
      common < newPath.length &&
      path[common].id === newPath[common].id
    )
      common++;
    setCutDepth(Math.max(0, common));
    if (shouldAnimate && path.length > common && phase !== "closed") {
      pending.current = target.id;
      switching.current = true;
      closing.current = true;
      setPhase("closing");
    } else {
      pending.current = null;
      switching.current = false;
      setVisualId(target.id);
      setPhase("open");
      onOpen(target);
    }
  }
  function control(node: TopicNode, folder = false) {
    const topic = records.get(node.id)!;
    const Icon = folder ? Folder : iconFor(topic.name);
    const depth = path.findIndex((t) => t.id === node.id);
    const expanded =
      active.has(node.id) && !(phase !== "open" && depth >= cutDepth);
    return (
      <div className="hybrid-node-card">
        <button
          className="hybrid-node"
          data-topic-id={node.id}
          data-selected={expanded}
          data-has-bubble={!!proposalCounts?.[node.id]}
          data-wrap-label={/\S+\s+\S+/.test(topic.name)}
          aria-label={`Open ${topic.name}${proposalCounts?.[node.id] ? `, ${proposalCounts[node.id]} open proposals` : ""}`}
          aria-expanded={
            node.children.length || node.id === selectedId
              ? expanded
              : undefined
          }
          onPointerDown={() => setPointer(true)}
          onKeyDown={() => setPointer(false)}
          onClick={(event) => choose(node, event.detail > 0)}
        >
          <Icon aria-hidden="true" />
          <strong>{topic.name}</strong>
          {proposalCounts?.[node.id] &&
            (onOpenProposals ? (
              <span className="hybrid-proposal-slot" aria-hidden="true" />
            ) : (
              <ProposalBubble count={proposalCounts[node.id]} />
            ))}
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <ProposalBubbleButton
          count={proposalCounts?.[node.id]}
          name={topic.name}
          onClick={
            onOpenProposals
              ? (origin) => onOpenProposals(topic, origin)
              : undefined
          }
        />
      </div>
    );
  }
  const evidenceCurrent = selectedId === candidate;
  function folderBranch(node: TopicNode): React.ReactNode {
    const depth = path.findIndex((t) => t.id === node.id);
    const expanded =
      active.has(node.id) && (phase === "open" || depth < cutDepth);
    return (
      <li key={node.id}>
        {control(node, true)}
        <motion.div
          className="hybrid-folder-branch"
          initial={false}
          animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0 }}
          transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
          inert={!expanded}
          aria-hidden={!expanded || undefined}
          onAnimationComplete={() => {
            if (depth === cutDepth) finish();
          }}
        >
          <div>
            {node.id === selectedId && evidenceCurrent && children}
            {node.children.length > 0 && (
              <ul>{node.children.map(folderBranch)}</ul>
            )}
          </div>
        </motion.div>
      </li>
    );
  }
  if (!roots.length)
    return (
      <p className="hybrid-empty">
        No {filing.toLowerCase()} topics in this page.
      </p>
    );
  if (representation === "folders")
    return (
      <section className="hybrid-folder-tree" aria-label="Category folders">
        <ul>{(organized ? root!.children : roots).map(folderBranch)}</ul>
      </section>
    );
  function treeLevel(nodes: TopicNode[], depth: number): React.ReactNode {
    const chosen = nodes.find((node) => node.id === path[depth]?.id);
    const expanded = !!chosen && (phase === "open" || depth < cutDepth);
    return (
      <div className="hybrid-tree-level">
        <div className="hybrid-node-level" data-depth={depth}>
          <motion.svg
            className="hybrid-parent-stem"
            data-connector-parent={chosen?.id}
            initial={false}
            animate={{ opacity: expanded ? 1 : 0 }}
            transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden="true"
          />
          <ul
            className="hybrid-node-row"
            aria-label={
              depth ? "Categories, scroll horizontally" : "Filing root"
            }
          >
            {nodes.map((node) => (
              <li key={node.id}>{control(node)}</li>
            ))}
          </ul>
        </div>
        <motion.div
          className="hybrid-open-branch"
          initial={false}
          animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0 }}
          transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
          inert={!expanded}
          aria-hidden={!expanded || undefined}
          onAnimationComplete={() => {
            if (depth === cutDepth) finish();
          }}
        >
          <div className="hybrid-branch-content">
            <svg
              className="hybrid-edges"
              data-connector-parent={chosen?.id}
              aria-hidden="true"
            />
            {chosen?.children.length
              ? treeLevel(chosen.children, depth + 1)
              : null}
            {chosen?.id === selectedId && evidenceCurrent && children}
          </div>
        </motion.div>
      </div>
    );
  }
  return (
    <section
      ref={treeRef}
      className="hybrid-topic-tree"
      aria-label="Topic branching diagram"
    >
      {treeLevel(roots, 0)}
    </section>
  );
}
