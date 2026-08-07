import { Link } from "react-router-dom";
import "./NotFound.css";

function NotFound() {
  return (
    <div className="mp-404">
      <span className="mp-404__code">404</span>
      <h1>Page not found</h1>
      <p>The page you are looking for doesn&apos;t exist or has been moved.</p>
      <Link to="/" className="mp-404__link">
        Back to Dashboard
      </Link>
    </div>
  );
}

export default NotFound;
