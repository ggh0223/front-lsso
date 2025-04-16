"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  adminLogin,
  verifyToken,
  refreshAuthToken,
  adminLogout,
  User,
  AdminAuthData,
} from "../api/auth";
import { ApiResponse } from "../api/types";
// import { mockStore } from "../api/mockStore";

// Track if authentication has been initialized
let isAuthInitialized = false;

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<ApiResponse<AdminAuthData>>;
  logout: () => Promise<void>;
  error: string | null;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(!isAuthInitialized);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Helper to clear auth data
  const clearAuthData = useCallback(() => {
    console.log("로그아웃: 인증 데이터 초기화");
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userData");
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    // Skip if already initialized
    if (isAuthInitialized) {
      console.log("인증 이미 초기화됨");
      try {
        const storedUserData = localStorage.getItem("userData");
        if (storedUserData) {
          const userData = JSON.parse(storedUserData);
          setUser(userData);
          setIsAuthenticated(true);
        }
      } catch (e) {
        console.error("캐시된 사용자 데이터 로드 오류:", e);
      }
      return;
    }

    console.log("인증 초기화 중...");
    const initAuth = async () => {
      setIsLoading(true);
      try {
        const storedToken = localStorage.getItem("authToken");
        const storedUserData = localStorage.getItem("userData");

        if (!storedToken) {
          console.log("토큰 없음: 인증되지 않은 상태로 설정");
          setIsAuthenticated(false);
          setUser(null);
          isAuthInitialized = true;
          setIsLoading(false);
          return;
        }

        // Load user from localStorage if available
        if (storedUserData) {
          try {
            const userData = JSON.parse(storedUserData);
            setUser(userData);
            setIsAuthenticated(true);
            console.log("로컬스토리지에서 사용자 로드:", userData);
          } catch (e) {
            console.error("로컬스토리지 사용자 데이터 파싱 오류:", e);
          }
        }

        // Verify token with the server
        console.log("토큰 검증 요청 중...");
        const tokenResponse = await verifyToken(storedToken);

        if (tokenResponse.success && tokenResponse.data) {
          console.log("토큰 검증 성공:", tokenResponse);
          setIsAuthenticated(true);
          setUser(tokenResponse.data.user);

          // Update userData in localStorage
          localStorage.setItem(
            "userData",
            JSON.stringify(tokenResponse.data.user)
          );

          // Refresh token if needed
          if (tokenResponse.data.token !== storedToken) {
            localStorage.setItem("authToken", tokenResponse.data.token);
          }
        } else {
          console.log("토큰 검증 실패, 토큰 갱신 시도");
          // Token verification failed - try refreshing
          const refreshToken = localStorage.getItem("refreshToken");
          if (refreshToken) {
            try {
              const refreshResponse = await refreshAuthToken(refreshToken);
              if (refreshResponse.success && refreshResponse.data) {
                console.log("토큰 갱신 성공:", refreshResponse);
                localStorage.setItem("authToken", refreshResponse.data.token);
                localStorage.setItem(
                  "refreshToken",
                  refreshResponse.data.refreshToken
                );
                localStorage.setItem(
                  "userData",
                  JSON.stringify(refreshResponse.data.user)
                );
                setIsAuthenticated(true);
                setUser(refreshResponse.data.user);
              } else {
                console.log("토큰 갱신 실패:", refreshResponse);
                clearAuthData();
              }
            } catch (refreshError) {
              console.error("토큰 갱신 오류:", refreshError);
              clearAuthData();
            }
          } else {
            console.log("리프레시 토큰 없음");
            clearAuthData();
          }
        }
      } catch (error) {
        console.error("인증 초기화 오류:", error);
        clearAuthData();
      } finally {
        setIsLoading(false);
        isAuthInitialized = true;
      }
    };

    initAuth();
  }, [clearAuthData]);

  // Login function
  const login = async (
    email: string,
    password: string
  ): Promise<ApiResponse<AdminAuthData>> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await adminLogin(email, password);
      console.log("로그인 응답:", response);

      if (response.success && response.data) {
        localStorage.setItem("authToken", response.data.token);
        localStorage.setItem("refreshToken", response.data.refreshToken);
        localStorage.setItem("userData", JSON.stringify(response.data.user));

        setIsAuthenticated(true);
        setUser(response.data.user);
        return response;
      } else {
        const errorMsg = response.error?.message || "로그인에 실패했습니다.";
        setError(errorMsg);
        return response;
      }
    } catch (error) {
      console.error("로그인 오류:", error);
      const errorMessage = "서버 오류가 발생했습니다.";
      setError(errorMessage);
      return {
        success: false,
        error: {
          code: "AUTH_SERVER_ERROR",
          message: errorMessage,
        },
      };
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    setIsLoading(true);

    try {
      const token = localStorage.getItem("authToken") || "";
      const refreshToken = localStorage.getItem("refreshToken") || "";

      await adminLogout(token, refreshToken);
      clearAuthData();
      router.push("/");
    } catch (error) {
      console.error("로그아웃 오류:", error);
      // Even if the server logout fails, we'll still clear local auth
      clearAuthData();
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    error,
  };
}
