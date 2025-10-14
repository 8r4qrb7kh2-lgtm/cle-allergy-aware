// Get environment variables
const SUPABASE_URL = 'https://abcdefghijk.supabase.co'; // Replace with YOUR URL
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Replace with YOUR KEY

// Initialize Supabase
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabaseClient;