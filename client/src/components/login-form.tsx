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
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-6">
      {/* Floating Card Container - 50/50 Split */}
      <div 
        className="w-full max-w-4xl min-h-[520px] grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl"
        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
      >
        
        {/* Left Panel - Form (50%) */}
        <div className="flex flex-col items-center justify-center p-8 md:p-12 bg-white dark:bg-slate-950">
          <div className="w-full max-w-sm space-y-6">
            {/* Logo & Header */}
            <div className="space-y-3 text-center">
              <div className="flex justify-center">
                <img src={logoUrl} alt="OrderFlowAI Logo" className="h-14 w-14 rounded-xl shadow-md" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome Back</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Sign in to your account to continue
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Input */}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 h-11 rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400"
                  data-testid="input-email"
                />
              </div>

              {/* Password Input */}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 h-11 rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400"
                  data-testid="input-password"
                />
              </div>

              {/* Sign In Button */}
              <Button
                type="submit"
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
                data-testid="button-login"
              >
                Sign In
              </Button>
            </form>

            {/* Forgot Password Link */}
            <div className="text-center pt-2">
              <a href="#" className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium">
                Forgot password?
              </a>
            </div>
          </div>
        </div>

        {/* Right Panel - Visual (50%) */}
        <div className="hidden md:flex items-center justify-center bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 p-10 relative overflow-hidden">
          {/* Abstract Pattern Background */}
          <div className="absolute inset-0">
            <div className="absolute top-10 left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute bottom-10 right-10 w-56 h-56 bg-white/10 rounded-full blur-2xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl" />
          </div>

          {/* Decorative Circles */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 border border-white/10 rounded-full" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 border border-white/10 rounded-full" />
          </div>

          {/* Content */}
          <div className="relative z-10 text-center space-y-8 max-w-xs">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-white">OrderFlowAI</h2>
              <p className="text-blue-100 text-base leading-relaxed">
                Streamline your Shopify order management with intelligent assignment and tracking
              </p>
            </div>
            <div className="space-y-3 text-sm text-blue-50">
              <div className="flex items-center justify-center gap-3">
                <div className="w-1.5 h-1.5 bg-blue-200 rounded-full" />
                <span>Real-time order tracking</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <div className="w-1.5 h-1.5 bg-blue-200 rounded-full" />
                <span>Smart agent assignment</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <div className="w-1.5 h-1.5 bg-blue-200 rounded-full" />
                <span>Automated workflows</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
