function Profile() {
  const user = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("mailpilot_user") || "null");
    } catch {
      return null;
    }
  })();

  if (!user) {
    return <p>Please sign in to view your profile.</p>;
  }

  return (
    <div>
      <h2>Profile</h2>
      <p>
        <strong>Name:</strong> {user.name}
      </p>
      <p>
        <strong>Email:</strong> {user.email}
      </p>
      {user.profile_picture && (
        <img
          src={user.profile_picture}
          alt={user.name}
          width={80}
          height={80}
          style={{ borderRadius: "50%" }}
        />
      )}
    </div>
  );
}

export default Profile;
