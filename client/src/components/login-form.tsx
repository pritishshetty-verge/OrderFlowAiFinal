import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import logoUrl from "@assets/image_1761228744572.png";

export interface RegisterPayload {
  email: string;
  password: string;
  username: string;
  fullName: string;
}

interface LoginFormProps {
  onLogin?: (email: string, password: string, role: string) => void;
  onRegister?: (data: RegisterPayload) => Promise<void> | void;
}

export function LoginForm({ onLogin, onRegister }: LoginFormProps) {
  // Shared tab state
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  // Bootstrap check — only show the "Create admin account" tab if the users
  // table is empty. Once the first admin exists, this flips to false and
  // subsequent accounts have to go through the invite flow.
  const [canRegister, setCanRegister] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/can-register-admin")
      .then((r) => (r.ok ? r.json() : { canRegister: false }))
      .then((data) => {
        if (!cancelled) setCanRegister(Boolean(data.canRegister));
      })
      .catch(() => {
        if (!cancelled) setCanRegister(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sign-in state (unchanged behavior)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"admin" | "manager" | "agent">("admin");

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin?.(email, password, selectedRole);
  };

  // Sign-up state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupFullName, setSignupFullName] = useState("");
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSubmitting, setSignupSubmitting] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setSignupSubmitting(true);
    try {
      await onRegister?.({
        email: signupEmail,
        password: signupPassword,
        username: signupUsername,
        fullName: signupFullName,
      });
    } catch (err: any) {
      setSignupError(err?.message || "Failed to create account");
    } finally {
      setSignupSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <img src={logoUrl} alt="OrderFlowAI Logo" className="h-16 w-16 rounded-lg" />
          </div>
          <div>
            <CardTitle className="text-2xl">Welcome to OrderFlowAI</CardTitle>
            <CardDescription>
              {canRegister
                ? "Sign in or create the first admin account"
                : "Sign in to manage your Shopify orders"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "signin" | "signup")}>
            <TabsList className={`grid w-full ${canRegister ? "grid-cols-2" : "grid-cols-1"}`}>
              <TabsTrigger value="signin" data-testid="tab-signin">
                Sign In
              </TabsTrigger>
              {canRegister && (
                <TabsTrigger value="signup" data-testid="tab-signup">
                  Create Account
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="signin" className="mt-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="input-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Demo Role Selection</Label>
                  <div className="flex gap-2">
                    {(["admin", "manager", "agent"] as const).map((role) => (
                      <Button
                        key={role}
                        type="button"
                        variant={selectedRole === role ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedRole(role)}
                        className="flex-1 capitalize"
                        data-testid={`button-role-${role}`}
                      >
                        {role}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button type="submit" className="w-full" data-testid="button-login">
                  Sign In
                </Button>
              </form>
            </TabsContent>

            {canRegister && (
              <TabsContent value="signup" className="mt-4">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    This is the first account on this workspace, so it will be
                    created as a <strong>full-control admin</strong>. Once saved,
                    this sign-up tab disappears and future users must be invited
                    from Settings &rarr; Team.
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-fullname">Full Name</Label>
                    <Input
                      id="signup-fullname"
                      type="text"
                      placeholder="Jane Doe"
                      value={signupFullName}
                      onChange={(e) => setSignupFullName(e.target.value)}
                      required
                      data-testid="input-signup-fullname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">Username</Label>
                    <Input
                      id="signup-username"
                      type="text"
                      placeholder="jane"
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      required
                      minLength={3}
                      data-testid="input-signup-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="admin@example.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      data-testid="input-signup-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={8}
                      data-testid="input-signup-password"
                    />
                  </div>

                  {signupError && (
                    <div
                      className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
                      data-testid="text-signup-error"
                    >
                      {signupError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={signupSubmitting}
                    data-testid="button-signup"
                  >
                    {signupSubmitting ? "Creating account…" : "Create Admin Account"}
                  </Button>
                </form>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
