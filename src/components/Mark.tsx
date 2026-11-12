import { WtSwoosh } from "./WtLogo";

/** Símbolo do WT Sistemas em miniatura (menu lateral). */
export function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <b>WT</b>
      <WtSwoosh className="mark-swoosh" />
    </span>
  );
}
