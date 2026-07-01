export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <span className="footer__brand">Gabriel Gomez</span>
        <span className="footer__meta">
          &copy; {new Date().getFullYear()} — Built &amp; designed by GG
        </span>
      </div>
    </footer>
  )
}
