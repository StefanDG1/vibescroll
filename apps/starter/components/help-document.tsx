import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import Image from "next/image";
import { helpAsset, safeHelpUrl } from "@/lib/help-content";

export function HelpDocument({
  text,
  assets = [],
}: {
  text: string;
  assets?: readonly string[];
}) {
  return (
    <article className="help-article">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={safeHelpUrl}
        components={{
          a: ({ href, children }) =>
            href ? (
              <Link href={href}>{children}</Link>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) => {
            const asset =
              typeof src === "string" ? helpAsset(src, assets) : undefined;
            return asset ? (
              <span className="help-illustration">
                <Image
                  src={asset.path}
                  alt={asset.alt}
                  width={asset.width}
                  height={asset.height}
                  unoptimized
                />
                <span className="fine">{asset.caption}</span>
              </span>
            ) : (
              <span className="fine">{alt}</span>
            );
          },
        }}
      >
        {text}
      </Markdown>
    </article>
  );
}
