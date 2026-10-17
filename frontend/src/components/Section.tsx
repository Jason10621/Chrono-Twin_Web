import type { ReactNode } from "react";

export function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl scroll-mt-16 px-5 py-16 md:px-8 md:py-24 ${className}`}>
      {children}
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-10 text-center md:mb-14">
      <p className="t-eyebrow mb-3">{eyebrow}</p>
      <h2 className="t-h2">{title}</h2>
      {sub && <p className="t-lead mx-auto mt-4 max-w-2xl">{sub}</p>}
    </div>
  );
}
