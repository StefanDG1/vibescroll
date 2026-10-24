// Verify operator WorkOS subjects in the matching environment. Emails and
// preferences never grant this personal testing capability.
export function personalAllowed(subject: string) {
  return (
    process.env.DISABLE_PERSONAL_ANALYSIS !== "true" &&
    personalSubjectAllowed(subject)
  );
}
export function personalSubjectAllowed(subject: string) {
  try {
    const subjects = JSON.parse(
      process.env.PERSONAL_ALPHA_SUBJECTS_JSON ?? "[]",
    );
    return (
      Array.isArray(subjects) &&
      subjects.length <= 10 &&
      subjects.includes(subject)
    );
  } catch {
    return false;
  }
}

// A narrow testing gate, not commercial subscription eligibility or verified
// media execution. Enabling requires a separately reviewed official-host route.
export function workCloudTextAllowed(subject: string) {
  return (
    process.env.WORK_CLOUD_TEXT_ENABLED === "true" &&
    process.env.WORK_CLOUD_TEXT_VERIFIED === "true" &&
    process.env.DISABLE_INFERENCE !== "true" &&
    personalAllowed(subject)
  );
}
