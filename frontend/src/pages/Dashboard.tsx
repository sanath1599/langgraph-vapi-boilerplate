import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Users, Building2, Calendar, Key } from "lucide-react";

const links = [
  { to: "/users", label: "Users", description: "View and manage users", icon: Users },
  { to: "/organizations", label: "Organizations", description: "View organizations", icon: Building2 },
  { to: "/appointments", label: "Appointments", description: "View appointments by date range", icon: Calendar },
  { to: "/api-keys", label: "API Keys", description: "Create and manage API keys", icon: Key },
];

export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">Dashboard</h1>
      <p className="text-muted-foreground mb-6">
        Admin interface for users, organizations, appointments, and API keys.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {links.map(({ to, label, description, icon: Icon }) => (
          <Card key={to}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4">{description}</p>
              <Button asChild variant="secondary" size="sm" className="text-foreground">
                <Link to={to}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
