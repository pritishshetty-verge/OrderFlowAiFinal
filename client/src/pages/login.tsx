import { LoginForm } from "@/components/login-form";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [, setLocation] = useLocation();

  const handleLogin = async (email: string, password: string) => {
    console.log("Login successful:", { email });
    
    // Fetch actual user from database by email to get real userId and role
    try {
      const response = await fetch(`/api/users/by-email/${encodeURIComponent(email)}`);
      if (response.ok) {
        const user = await response.json();
        // Use the actual user ID and role from the database
        localStorage.setItem("userRole", user.role);
        localStorage.setItem("userId", user.id);
        localStorage.setItem("userEmail", user.email);
      } else {
        console.error("User not found in database");
        return;
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      return;
    }
    
    setLocation("/");
  };

  return <LoginForm onLogin={handleLogin} />;
}
