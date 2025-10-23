import { LoginForm } from "@/components/login-form";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [, setLocation] = useLocation();

  const handleLogin = (email: string, password: string, role: string) => {
    console.log("Login successful:", { email, role });
    localStorage.setItem("userRole", role);
    setLocation("/");
  };

  return <LoginForm onLogin={handleLogin} />;
}
