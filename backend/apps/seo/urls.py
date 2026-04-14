from django.urls import path

from .views import dynamic_sitemap, robots_txt

urlpatterns = [
    path("robots.txt", robots_txt, name="robots_txt"),
    path("sitemap.xml", dynamic_sitemap, name="sitemap_xml"),
]
