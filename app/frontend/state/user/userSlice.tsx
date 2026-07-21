import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { authService } from '../../services/authService';
import { tokenStorage } from '../../services/tokenStorage';

// Async thunks for authentication
export const loginUser = createAsyncThunk(
  'user/login',
  async (credentials: { email: string; password: string; rememberMe?: boolean }, { rejectWithValue }) => {
    try {
      const { email, password, rememberMe } = credentials;
      const response = await authService.login({ email, password });
      // Single source of truth for token storage. "Remember me" -> localStorage
      // (survives restart); otherwise sessionStorage (cleared when the tab closes).
      tokenStorage.storeToken(response.token, { storageType: rememberMe ? 'local' : 'session' });
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Login failed');
    }
  }
);

export const logoutUser = createAsyncThunk(
  'user/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authService.logout();
      // Clear token from storage on logout
      tokenStorage.clearToken();
      return null;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Logout failed');
    }
  }
);

export const checkAuthStatus = createAsyncThunk(
  'user/checkAuth',
  async (_, { rejectWithValue }) => {
    try {
      const token = tokenStorage.getToken();

      if (token) {
        const isValid = await authService.validateToken(token);
        
        if (isValid) {
          // For now, return only the token; user data can be fetched separately if needed
          return { token, user: null };
        }
      }
      return null;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Auth check failed');
    }
  }
);

const initialState: UserState = {
  isSignedIn: false,
  token: null,
  user: null,
  isLoading: false,
  error: null
};

const userSlice = createSlice({
  name: 'User',
  initialState,
  reducers: {
    signIn: (state) => {
      state.isSignedIn = true
    },
    signOut: (state) => {
      state.isSignedIn = false
      state.token = null
      state.user = null
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    // Login cases
    builder.addCase(loginUser.pending, (state) => {
      state.isLoading = true
      state.error = null
    })
    builder.addCase(loginUser.fulfilled, (state, action) => {
      state.isLoading = false
      state.isSignedIn = true
      state.token = action.payload.token
      state.user = action.payload.user
      state.error = null
    })
    builder.addCase(loginUser.rejected, (state, action) => {
      state.isLoading = false
      state.error = action.payload as string
    })

    // Logout cases
    builder.addCase(logoutUser.pending, (state) => {
      state.isLoading = true
    })
    builder.addCase(logoutUser.fulfilled, (state) => {
      state.isLoading = false
      state.isSignedIn = false
      state.token = null
      state.user = null
      state.error = null
    })
    builder.addCase(logoutUser.rejected, (state, action) => {
      state.isLoading = false
      state.error = action.payload as string
    })

    // Check auth status cases
    builder.addCase(checkAuthStatus.pending, (state) => {
      state.isLoading = true
    })
    builder.addCase(checkAuthStatus.fulfilled, (state, action) => {
      state.isLoading = false
      if (action.payload) {
        state.isSignedIn = true
        state.token = action.payload.token
        state.user = action.payload.user
      } else {
        state.isSignedIn = false
        state.token = null
        state.user = null
      }
      state.error = null
    })
    builder.addCase(checkAuthStatus.rejected, (state, action) => {
      state.isLoading = false
      state.error = action.payload as string
    })
  }
})

export const { signIn, signOut, clearError } = userSlice.actions;
export default userSlice.reducer;
