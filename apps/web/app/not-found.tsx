import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="screen">
      <div className="shell">
        <header className="simple-topbar">
          <Brand />
        </header>
        <section className="card">
          <p className="eyebrow">404</p>
          <h1 className="panel-title">That page is out of bounds</h1>
          <p className="lede">
            Check the invite link, or head back and create a new match.
          </p>
          <Link className="btn btn-lg btn-primary" href="/">
            Back to home
          </Link>
        </section>
      </div>
    </main>
  );
}
