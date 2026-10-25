"use client";

import { createContext, useContext, useState } from "react";

// Create the context
const UserDataContext = createContext();

// Custom hook to use user data context
export const useUserData = () => useContext(UserDataContext);

// Provider component
export const UserDataProvider = ({ children }) => {
  const [userData, setUserData] = useState(null);

  return (
    <UserDataContext.Provider value={{ userData, setUserData }}>
      {children}
    </UserDataContext.Provider>
  );
};
