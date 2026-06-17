[日本語](./index.ja.html)

# Tilia - Samples

Tilia is an extensible framework for building interactive maps and geospatial applications on the web. It works with only static files (except for the route searching feature).

Repository: <a href="https://github.com/hiroaki/Tilia">https://github.com/hiroaki/Tilia</a>

You can try working samples from the following links:
- [Embed Sample](./embed/index.html)
  This shows how to embed a map in a page. By embedding a Tilia map in a template and replacing only the data, the same template can be reused for different content.
- [Viewer Sample](./viewer/)
  This shows how to use Tilia as the foundation for a map application. This sample allows you to drag and drop GPX and JPG files.
- [Editor Sample](./editor/chiyoda-ku.html)
  This sample allows you to try route searching and track editing features. You can also download the result as a GPX file.

Since each feature of Tilia is provided as a plugin, all features can be combined into a single application. However, the samples are configured to focus on a specific set of features for each use case.


## About the backend for route searching

Tilia basically works only on the client side, but since it is difficult to complete the route search function on the client side, you need to run a routing engine on the backend.

In the current version, we created a project called [Phloem](https://github.com/hiroaki/Phloem) as a gateway between Tilia and the routing engine. Phloem acts as a routing facade for Tilia and forwards requests to the routing engine through an internal adapter.

Also, the routing engine working on the backend of this sample uses a self-hosted GraphHopper instance. However, since GraphHopper consumes a lot of memory, and the demo is hosted on limited server resources, the routing data is limited to the Chiyoda-ku area of Tokyo, and route searches are restricted to walking routes only. Therefore, **when using the editor sample, please ensure that both the start and destination are within Chiyoda-ku**. (The sample shows that range with a polygon)

If you want to perform route searches for various regions of the world, it is realistic to use the GraphHopper official API service. By creating an account and obtaining an API key, you can set it in Phloem and use route searching from Tilia. You need to build a Phloem server, but if you can use Docker, you can start Phloem with a single command line. For details, please refer to the [Phloem Setup Guide](./editor/guide.html).

## About the data used

For the boundary data of Chiyoda-ku, we used the following dataset.
- "Historical Administrative Area Dataset β version" (created by CODH) doi:10.20676/00000447
- Data source: https://geoshape.ex.nii.ac.jp/city/resource/13101A1968.html
- Data used: "Historical changes in administrative boundaries" → "2023-01-01" [GeoJSON file](https://geoshape.ex.nii.ac.jp/city/geojson/20230101/13/13101A1968.geojson)
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
