import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState";

function NotFound() {
  return (
    <div className="page page--narrow">
      <EmptyState
        icon="🧭"
        title="Page not found"
        message="The page you're looking for doesn't exist or has moved."
        action={
          <Link to="/" className="btn btn--primary">
            Go to the dashboard
          </Link>
        }
      />
    </div>
  );
}

export default NotFound;
