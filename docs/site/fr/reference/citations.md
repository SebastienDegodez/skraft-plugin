---
layout: doc
lang: fr
title: "Bibliographie"
description: "Chaque référence citée par le handbook : auteurs, ouvrage, année, éditeur."
---

# Bibliographie

> Chaque référence citée par le handbook, rangée par clé : auteurs, ouvrage, année, éditeur.

{% for cite in site.data.citations %}
<div id="cite-{{ cite.key }}" class="citation-entry">
  <p><strong>{{ cite.authors }}</strong> ({{ cite.year }}). <em>{{ cite.title }}</em>.
  {% if cite.publisher %}{{ cite.publisher }}.{% endif %}
  {% if cite.type == "article" %}(article){% elsif cite.type == "chapter" %}(chapitre){% endif %}
  {% if cite.url %}<a href="{{ cite.url }}">{{ cite.url }}</a>{% endif %}</p>
</div>
{% endfor %}
