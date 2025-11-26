export async function fetchManagerRestaurants(supabaseClient, userId) {
  if (!supabaseClient || !userId) return [];
  try {
    const { data: assignments, error } = await supabaseClient
      .from('restaurant_managers')
      .select('restaurant_id')
      .eq('user_id', userId);

    if (error) {
      console.error('[manager-context] failed to load assignments', error);
      return [];
    }

    const restaurantIds = (assignments || [])
      .map((row) => row.restaurant_id)
      .filter(Boolean);

    if (!restaurantIds.length) return [];

    const { data: restaurants, error: restaurantError } = await supabaseClient
      .from('restaurants')
      .select('id, name, slug')
      .in('id', restaurantIds);

    if (restaurantError) {
      console.error('[manager-context] failed to load restaurant details', restaurantError);
      return [];
    }

    return (restaurants || [])
      .filter((row) => row && row.id && row.slug)
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name || 'Restaurant'
      }));
  } catch (error) {
    console.error('[manager-context] unexpected error', error);
    return [];
  }
}


