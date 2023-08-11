# Skyblog Archiver

Permet d'archiver un skyblog 100% en local depuis votre navigateur.

Les données suivantes sont archivées :

* articles
* images des articles
* image de l'avatar
* commentaires
* résultat de l'API en JSON, incluant tous les médias, commentaires, et le contenu des posts en BBCode.

Un fichier ZIP est généré dans le navigateur.

## Limitations de l'API

* Il faut faire 2 requêtes pour avoir à la fois le contenu en HTML et en BBCode :-(
* Il faut faire une requête pour chaque post pour savoir s'il a des médias ou non, ça aurait été mieux d'avoir les médias joints à l'article dans la requête `list_posts`
