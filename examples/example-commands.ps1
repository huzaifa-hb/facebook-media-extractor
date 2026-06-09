# Run these from any PowerShell window after install-windows.ps1 has been run.

media-extract "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=1039345822595722" --max-items 25

media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --max-items 50 --scroll-rounds 90

media-extract "FACEBOOK_ADS_LIBRARY_URL_HERE" --max-items 50 --scroll-rounds 140 --headful true

media-extract "https://www.facebook.com/somepage/photos" --max-items 50 --headful true

media-extract "PUBLIC_NON_META_URL_HERE" --adapter generic-page
