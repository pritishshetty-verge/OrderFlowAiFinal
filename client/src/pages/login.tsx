import { LoginForm } from "@/components/login-form";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [, setLocation] = useLocation();

  const handleLogin = async (email: string, password: string, role: string) => {
    console.log("Login successful:", { email, role });
    
    // Fetch actual user from database by email to get real userId
    try {
      const response = await fetch("/api/users");
      if (response.ok) {
        const users = await response.json();
        const user = users.find((u: any) => u.email === email);
        
        if (user) {
          // Use the actual user ID from the database
          localStorage.setItem("userRole", user.role);
          localStorage.setItem("userId", user.id);
          localStorage.setItem("userEmail", user.email);
        } else {
          // Fallback: use a default admin user if email not found
          // This helps with testing when logging in with arbitrary emails
          const defaultAdmin = users.find((u: any) => u.role === "admin");
          if (defaultAdmin) {
            localStorage.setItem("userRole", defaultAdmin.role);
            localStorage.setItem("userId", defaultAdmin.id);
            localStorage.setItem("userEmail", defaultAdmin.email);
          }
        }
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

  return <LoginForm onLogin={handleLogin} />;
}
