import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader } from './ui/loader';
import type { AdminUser } from '../types/database';
import { posthog } from '../lib/posthog';

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const checkSession = async () => {
      // If we are in the middle of an OAuth callback, defer to onAuthStateChange
      // so we don't accidentally set loading=false before the SIGNED_IN event fires.
      if (window.location.hash.includes('access_token')) {
        return;
      }

      const startTime = Date.now();
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // Fetch admin user details. 
          let retries = 3;
          let adminUser = null;
          
          while (retries > 0 && !adminUser) {
            const { data, error } = await supabase
              .from('admin_users')
              .select('*, companies(status)')
              .eq('email', session.user.email)
              .single();
              
            if (error) {
              // PGRST116 means no rows returned from single()
              if (error.code === 'PGRST116') {
                const { data: newUser, error: insertError } = await supabase
                  .from('admin_users')
                  .insert({
                    email: session.user.email,
                    full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Unknown User'
                  })
                  .select()
                  .single();
                  
                if (newUser) {
                  adminUser = newUser;
                  break;
                } else if (insertError) {
                  console.error('Error auto-creating admin user:', insertError);
                }
              } else {
                console.error('Error fetching adminUser:', error);
              }
            }
              
            if (data) {
              adminUser = { ...data, company_status: data.companies?.status || 'active' };
              break;
            }
            
            // Wait 500ms before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
            retries--;
          }

          if (adminUser) {
            // Auto-promote mansaidus@gmail.com to super_admin locally if DB hasn't updated yet
            if (adminUser.email === 'mansaidus@gmail.com' && adminUser.role !== 'super_admin') {
              adminUser.role = 'super_admin';
            }
            setUser(adminUser);
            posthog.identify(adminUser.id, {
              email: adminUser.email,
              role: adminUser.role,
              business_name: adminUser.business_name
            });
          } else {
            console.error('No admin user record found for this authenticated user.');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Session check error:', error);
      } finally {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
          setLoading(false);
        }, delay);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // SIGNED_IN from OAuth redirect: checkSession() already handles the initial user load.
      // We only need to handle SIGNED_OUT and TOKEN_REFRESHED here to avoid a race condition
      // where onAuthStateChange fires first with a null user and kicks us to /login.
      if (event === 'SIGNED_OUT') {
        posthog.reset();
        setUser(null);
        setLoading(false);
        return;
      }

      // For SIGNED_IN (OAuth callback) we re-fetch the admin profile
      if (event === 'SIGNED_IN' && session?.user) {
        let retries = 5; // more retries for new sign-ups where the trigger may lag
        let adminUser = null;

        while (retries > 0 && !adminUser) {
          const { data, error } = await supabase
            .from('admin_users')
            .select('*, companies(status)')
            .eq('email', session.user.email)
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              const { data: newUser, error: insertError } = await supabase
                .from('admin_users')
                .insert({
                  email: session.user.email,
                  full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Unknown User'
                })
                .select()
                .single();
                
              if (newUser) {
                adminUser = newUser;
                break;
              } else if (insertError) {
                console.error('Error auto-creating admin user in SIGNED_IN:', insertError);
              }
            } else {
              console.error('Error fetching adminUser in SIGNED_IN:', error);
            }
          }

          if (data) {
            adminUser = { ...data, company_status: data.companies?.status || 'active' };
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 600));
          retries--;
        }

        // Auto-promote mansaidus@gmail.com to super_admin locally if DB hasn't updated yet
        if (adminUser && (adminUser as AdminUser).email === 'mansaidus@gmail.com' && (adminUser as AdminUser).role !== 'super_admin') {
          (adminUser as AdminUser).role = 'super_admin';
        }

        if (adminUser) {
          posthog.identify((adminUser as AdminUser).id, {
            email: (adminUser as AdminUser).email,
            role: (adminUser as AdminUser).role,
            business_name: (adminUser as AdminUser).business_name
          });
          posthog.capture('user_logged_in', {
            role: (adminUser as AdminUser).role,
          });
        }

        setUser(adminUser || null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);


  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/admin',
        }
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // The actual redirect happens here, so we just return true.
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'An error occurred' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
