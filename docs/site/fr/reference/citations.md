---
layout: doc
lang: fr
title: "Bibliographie"
---

# Bibliographie

{% for cite in site.data.citations %}
<div id="cite-{{ cite.key }}" class="citation-entry">
  <p><strong>{{ cite.authors }}</strong> ({{ cite.year }}). <em>{{ cite.title }}</em>.
  {% if cite.type == "article" %}(article){% elsif cite.type == "chapter" %}(chapitre){% endif %}</p>
</div>
{% endfor %}
