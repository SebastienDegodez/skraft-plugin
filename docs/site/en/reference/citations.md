---
layout: doc
lang: en
title: "Bibliography"
---

# Bibliography

{% for cite in site.data.citations %}
<div id="cite-{{ cite.key }}" class="citation-entry">
  <p><strong>{{ cite.authors }}</strong> ({{ cite.year }}). <em>{{ cite.title }}</em>.
  {% if cite.type == "article" %}(article){% elsif cite.type == "chapter" %}(chapter){% endif %}</p>
</div>
{% endfor %}
