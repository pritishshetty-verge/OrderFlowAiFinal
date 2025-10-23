import { LoginForm } from "../login-form";

export default function LoginFormExample() {
  return (
    <LoginForm
      onLogin={(email, password, role) =>
        console.log("Login:", { email, password, role })
      }
    />
  );
}
