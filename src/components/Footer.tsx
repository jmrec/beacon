// import { useRouterState } from "@tanstack/react-router";

export default function Footer() {
  // const pathname = useRouterState({
  //   select: (state) => state.location.pathname,
  // });

  // const isRoot = pathname === "/";

  return (
    <footer className="border-t border-[var(--line)] px-4 py-1 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col items-center text-center">
        <p className="island-kicker">
          Not affiliated with{" "}
          <a
            href="https://www.beneco.com.ph"
            target="_blank"
            rel="noopener noreferrer"
            className="text-beneco-yellow hover:underline"
          >
            BENECO
          </a>
          . Outage data may not be real-time or accurate.
        </p>
      </div>
    </footer>
  );

  // const year = new Date().getFullYear();
  // return (
  //   <footer className=" border-t border-[var(--line)] px-4 pb-3 pt-3 text-[var(--sea-ink-soft)]">
  //     <div className="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
  //       <p className="m-0 text-sm">
  //         &copy; {year} Juan Miguel Recondo. All rights reserved.
  //       </p>
  //       <p className="island-kicker m-0">Built with TanStack Start</p>
  //     </div>
  //   </footer>
  // );
}
