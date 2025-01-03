console.log('Loading Supabase client...');

// Supabase configuration
const SUPABASE_URL = 'https://jnnybkqyodxofussidmx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impubnlia3F5b2R4b2Z1c3NpZG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3MTM5MjAsImV4cCI6MjA1MTI4OTkyMH0.pqr5IZgiKfS9pSv7uRI32pf8PicJ6M9R8jOg8p9WimY';

// Initialize Supabase client
try {
    if (!window.supabase) {
        throw new Error('Supabase not loaded. Please check your internet connection.');
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client created');

    // Test connection
    supabase.auth.getSession().then(({ data, error }) => {
        if (error) {
            throw error;
        }
        console.log('Supabase connection test successful');
        
        // Export client
        window.supabaseClient = {
            client: supabase,
            ready: true
        };

        // Dispatch ready event
        window.dispatchEvent(new Event('supabaseReady'));
    }).catch(error => {
        console.error('Supabase connection test failed:', error);
        throw error;
    });

} catch (error) {
    console.error('Failed to initialize Supabase:', error);
    window.supabaseClient = { 
        ready: false,
        error: error
    };
}
