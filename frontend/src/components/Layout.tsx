import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "./ThemeProvider";
import { Button } from "./ui/button";
import { Moon, Sun, LayoutDashboard, Users, Building2, Calendar, Key, MessageSquare, LogOut } from "lucide-react";
import { cn } from "../lib/utils";

const LOGO_SRC = "/logo-no-bg.png";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/users", label: "Users", icon: Users },
  { to: "/organizations", label: "Organizations", icon: Building2 },
  { to: "/appointments", label: "Appointments", icon: Calendar },
  { to: "/api-keys", label: "API Keys", icon: Key },
  { to: "/chat", label: "Chat", icon: MessageSquare },
];

export default function Layout() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="flex h-14 items-center px-4 gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src={LOGO_SRC} alt="VAPI x LangGraph" className="h-8 w-auto object-contain" />
            <span className="font-bold text-foreground hidden sm:inline">VAPI x LangGraph</span>
          </Link>
          <nav className="flex items-center gap-1 flex-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to}>
                <Button
                  variant={location.pathname === to ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "text-foreground",
                    location.pathname === to && "bg-secondary text-secondary-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 mr-1.5" />
                  {label}
                </Button>
              </Link>
            ))}
          </nav>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-foreground"
            aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-foreground"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Log out
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
