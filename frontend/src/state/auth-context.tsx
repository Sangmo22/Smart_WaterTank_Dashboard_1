import React, { createContext, useContext, useState } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_USER: User = {
  id: "default_user_id",
  name: "Default User",
  email: "default@watertank.com",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user] = useState<User>(DEFAULT_USER);
  const [isLoading] = useState(false);

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

