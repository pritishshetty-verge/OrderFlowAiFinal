import { LoginForm } from "@/components/login-form";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [, setLocation] = useLocation();

  const handleLogin = (email: string, password: string, role: string) => {
    console.log("Login successful:", { email, role });
    
    // Generate a mock userId (in a real app, this would come from the backend)
    const mockUserId = crypto.randomUUID();
    
    // Store user data in localStorage
    localStorage.setItem("userRole", role);
    localStorage.setItem("userId", mockUserId);
    localStorage.setItem("userEmail", email);
    
    setLocation("/");
  };

  return <LoginForm onLogin={handleLogin} />;
}
