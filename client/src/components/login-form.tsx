import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock } from "lucide-react";
import logoUrl from "@assets/image_1761228744572.png";

interface LoginFormProps {
  onLogin?: (email: string, password: string, role: string) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Login attempt:", { email, password, role: "admin" });
    onLogin?.(email, password, "admin");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-5xl h-96 grid grid-cols-2 rounded-xl overflow-hidden shadow-2xl bg-white dark:bg-slate-950">
        {/* Left Panel - Form */}
        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-950">
          <div className="w-full max-w-xs space-y-8">
            {/* Logo & Header */}
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <img src={logoUrl} alt="OrderFlowAI Logo" className="h-12 w-12 rounded-lg" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Sign in to your account to continue
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-10 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  data-testid="input-email"
                />
              </div>

              {/* Password Input */}
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 h-10 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  data-testid="input-password"
                />
              </div>

              {/* Sign In Button */}
              <Button
                type="submit"
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all duration-200"
                data-testid="button-login"
              >
                Sign In
              </Button>
            </form>

            {/* Forgot Password Link */}
            <div className="text-center">
              <a href="#" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Forgot password?
              </a>
            </div>
          </div>
        </div>

        {/* Right Panel - Visual */}
        <div className="hidden sm:flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 dark:from-blue-700 dark:via-blue-800 dark:to-blue-900 p-12 relative overflow-hidden">
          {/* Abstract Pattern Background */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-white rounded-full blur-3xl" />
          </div>

          {/* Content */}
          <div className="relative z-10 text-center space-y-6">
            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-white">OrderSync</h2>
              <p className="text-blue-100 text-lg">
                Streamline your Shopify order management with intelligent assignment and tracking
              </p>
            </div>
            <div className="pt-6 space-y-3 text-sm text-blue-50">
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-blue-200 rounded-full" />
                <span>Real-time order tracking</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-blue-200 rounded-full" />
                <span>Smart agent assignment</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-blue-200 rounded-full" />
                <span>Automated workflows</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
