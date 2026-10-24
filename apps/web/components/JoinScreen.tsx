"use client";

import Link from "next/link";
import { isValidJoinCode, normalizeJoinCode } from "@fantom/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readSession, writeSession } from "@/lib/session";
import { Brand } from "./Brand";
import { JoinMatchCard } from "./JoinMatchCard";

type Props = {
  code: string;
};

export function JoinScreen({ code: codeInput }: Props) {
  const router = useRouter();
  const code = normalizeJoinCode(codeInput);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isValidJoinCode(code)) {
      setChecked(true);
      return;
    }

    const existing = readSession(code);
    if (existing) {
      router.replace(`/match/${existing.joinCode}`);
      return;
    }
    setChecked(true);
  }, [code, router]);

  return (
    <main className="screen">
      <div className="shell">
        <header className="simple-topbar">
          <Brand />
          <Link className="text-link" href="/">
            Home
          </Link>
        </header>

        {!checked ? (
          <div className="center-stage compact-stage">
            <p className="eyebrow">Match {code || "—"}</p>
            <h1 className="panel-title">Opening match…</h1>
          </div>
        ) : !isValidJoinCode(code) ? (
          <section className="card">
            <p className="eyebrow">Invalid link</p>
            <h1 className="panel-title">That match code isn&apos;t valid</h1>
            <p className="lede">
              Match codes are four characters. Ask the host to share the QR
              code or invite link again.
            </p>
            <Link className="btn btn-lg btn-primary" href="/">
              Back to home
            </Link>
          </section>
        ) : (
          <JoinMatchCard
            joinCode={code}
            onJoined={(session) => {
              if (!writeSession(session)) {
                return false;
              }
              router.replace(`/match/${session.joinCode}`);
              return true;
            }}
          />
        )}

        <footer className="page-footer">
          <span>FANTOM · WOMM-PSU</span>
          <span>Play safe.</span>
        </footer>
      </div>
    </main>
  );
}
