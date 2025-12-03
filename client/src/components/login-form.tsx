import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoUrl from "@assets/image_1761228744572.png";
import { Mail, Lock } from "lucide-react";

interface LoginFormProps {
  onLogin?: (email: string, password: string, role: string) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Login attempt:", { email, password });
    // Role is determined by backend - we just send empty string here
    onLogin?.(email, password, "");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel - Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo & Header */}
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <img 
                src={logoUrl} 
                alt="OrderFlowAI Logo" 
                className="h-14 w-14" 
              />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Welcome to OrderFlowAI</h1>
              <p className="text-muted-foreground mt-2">
                Sign in to manage your Shopify orders
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                  className="pl-10 rounded-full"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                  className="pl-10 rounded-full"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              className="w-full rounded-full h-11 text-base font-medium"
              data-testid="button-login"
            >
              Sign In
            </Button>
          </form>

          {/* Forgot Password Link */}
          <div className="text-center">
            <a 
              href="#" 
              className="text-sm text-primary hover:underline"
              data-testid="link-forgot-password"
            >
              Forgot Password?
            </a>
          </div>
        </div>
      </div>

      {/* Right Panel - Visual/Graphic */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-900 via-blue-700 to-blue-900 relative overflow-hidden items-center justify-center">
        {/* Animated gradient background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.3),transparent_70%)]" />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
            <defs>
              <filter id="blur">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
              </filter>
            </defs>
            <path
              d="M150,50 Q200,80 250,120 T300,200 Q320,280 250,320 T150,350 Q100,320 80,250 T50,150 Q80,80 150,50"
              fill="url(#grad)"
              filter="url(#blur)"
              opacity="0.6"
            />
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(96, 165, 250, 0.4)" />
                <stop offset="100%" stopColor="rgba(37, 99, 235, 0.4)" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Bottom Copyright Text */}
        <div className="absolute bottom-8 left-8 right-8">
          <p className="text-sm text-blue-100/60 text-center">
            © 2025 OrderFlowAI. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
