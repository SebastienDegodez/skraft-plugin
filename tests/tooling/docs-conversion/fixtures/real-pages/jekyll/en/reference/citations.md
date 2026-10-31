---
layout: doc
lang: en
title: "Bibliography"
description: "Every reference the handbook cites: authors, work, year, publisher."
---

# Bibliography

> Every reference the handbook cites, by key: authors, work, year, publisher.

{% for cite in site.data.citations %}
<div id="cite-{{ cite.key }}" class="citation-entry">
  <p><strong>{{ cite.authors }}</strong> ({{ cite.year }}). <em>{{ cite.title }}</em>.
  {% if cite.publisher %}{{ cite.publisher }}.{% endif %}
  {% if cite.type == "article" %}(article){% elsif cite.type == "chapter" %}(chapter){% endif %}
  {% if cite.url %}<a href="{{ cite.url }}">{{ cite.url }}</a>{% endif %}</p>
</div>
{% endfor %}
