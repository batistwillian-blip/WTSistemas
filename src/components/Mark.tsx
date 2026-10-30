/** Marca do sistema: três barras, uma por empresa. */
export function Mark() {
  return (
    <span className="mark">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="2" y="11" width="4" height="7" rx="1" fill="#C06C17" />
        <rect x="8" y="6" width="4" height="12" rx="1" fill="#4950B3" />
        <rect x="14" y="2" width="4" height="16" rx="1" fill="#A03876" />
      </svg>
    </span>
  );
}
