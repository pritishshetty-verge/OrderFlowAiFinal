import { LoginForm, type RegisterPayload } from "@/components/login-form";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [, setLocation] = useLocation();

  const handleLogin = async (email: string, password: string, role: string) => {
    console.log("Login successful:", { email, role });

    // Fetch actual user from database by email to get real userId
    try {
      const response = await fetch(`/api/users/by-email/${encodeURIComponent(email)}`);
      if (response.ok) {
        const user = await response.json();
        // Use the actual user ID and role from the database
        localStorage.setItem("userRole", user.role);
        localStorage.setItem("userId", user.id);
        localStorage.setItem("userEmail", user.email);
      } else {
        // If user not found, use the provided role and a mock ID
        console.warn("User not found in database, using mock data");
        localStorage.setItem("userRole", role);
        localStorage.setItem("userId", crypto.randomUUID());
        localStorage.setItem("userEmail", email);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      // Fallback to mock data if API fails
      localStorage.setItem("userRole", role);
      localStorage.setItem("userId", crypto.randomUUID());
      localStorage.setItem("userEmail", email);
    }

    setLocation("/");
  };

  const handleRegister = async (data: RegisterPayload) => {
    const response = await fetch("/api/auth/register-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      let message = "Failed to create account";
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
        else if (body?.details?.[0]?.message)
          message = body.details[0].message;
      } catch {
        // ignore parse errors; fall back to default message
      }
      throw new Error(message);
    }

    const user = await response.json();
    localStorage.setItem("userRole", user.role);
    localStorage.setItem("userId", user.id);
    localStorage.setItem("userEmail", user.email);
    setLocation("/");
  };

  return <LoginForm onLogin={handleLogin} onRegister={handleRegister} />;
}
