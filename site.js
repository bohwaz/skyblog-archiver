//const image_proxy = '/';
const image_proxy = 'https://skyproxy.bohwaz.net/';
const api_proxy = null;

var requests_count = 0;

var $ = (e) => document.querySelector(e);

var api = async (url, params) => {
	var ignore_errors = true;
	var params_str = '';

	if (requests_count++) {
		// Add some delay between requests
		await new Promise(r => setTimeout(r, 250));
	}

	if (typeof params == 'object' && params !== null) {
		Object.entries(params).forEach((e) => {
			params_str += e[0] + '=' + encodeURIComponent(e[1]) + '&';
		})
	}

	url = 'https://api.skyrock.com/' + url + '.json?' + params_str;

	if (api_proxy) {
		url = url.replace(/https:\/\//, api_proxy);
	}

	console.log('Requesting', url);
	var r = await fetch(url);

	if (r.status == 429 || r.status == 403) {
		if (ignore_errors) {
			return null;
		}

		throw 429;
	}

	var j = await r.json();

	if (!r.ok) {
		throw j.error ? j.error : url + ': ' + r.statusText + "\n" + JSON.stringify(j, null, "\t");
	}

	return j;
};

var req = async (url) => {
	if (api_proxy) {
		url = url.replace(/https:\/\//, api_proxy);
	}

	var r = await fetch(url);
	return await r.text();
};

var reqBlob = async (url) => {
	if (image_proxy) {
		// FIXME: i.skyrock.net/wir.skyrock.net don't have CORS to allow everyone to request,
		// so we need to use a local proxy
		url = url.replace(/https:\/\//, image_proxy);
	}

	var r = await fetch(url);

	if (!r.ok) {
		throw r.statusText;
	}

	return await r.blob();
};

function tpl(id, vars) {
	var out = $('#' + id).innerHTML;

	Object.entries(vars).forEach((e) => {
		var r = new RegExp('#' + e[0] + '#', 'g');
		out = out.replace(r, e[1]);
	});

	return out;
}

function date_format(ts)
{
	var d = new Date(ts*1000);
	return d.toLocaleDateString('fr-FR', {'timezone': 'Europe/Paris'});
}

const arrayReverseObj =
  obj => Object.keys(obj).sort().reverse().map(key=> ({...obj[key],key:key}) );

var zip = new JSZip();

async function archive(username, options)
{
	try {
		var blog = await api('v2/blog/get', {username});

		if (null === blog) {
			alert("Vous avez dépassé les limites de requêtes de l'API Skyrock.com, merci d'attendre une heure avant de recommencer.");
			return;
		}
	}
	catch (e) {
		alert('Blog introuvable' + "\n" + e);
		return;
	}

	if (!blog.nb_posts) {
		alert('Ce blog n\'a aucun article.');
		return;
	}

	var last_page = Math.ceil(blog.nb_posts / 10);
	var all_requests_count = 1 + last_page * 2 + blog.nb_posts;

	if (all_requests_count > 450 && options.bbcode) {
		options.bbcode = false;
		all_requests_count -= last_page;
	}

	if (all_requests_count > 475 && (options.images || options.comments)) {
		if (!confirm("Ce blog a trop d'articles, il ne sera pas possible de télécharger les images et commentaires.\nTélécharger le blog sans les images ni les commentaires ?")) {
			return;
		}

		options.images = false;
		options.comments = false;
	}

	var images = [];
	var posts = [];
	var html = `<!doctype html>
	<html lang="fr">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">
		<meta http-equiv="X-UA-Compatible" content="ie=edge">
		<title>Blog de ${username}</title>
		<link rel="stylesheet" type="text/css" media="screen" href="css/common.css" />
		<link rel="stylesheet" type="text/css" media="screen" href="css/tpl.css" />
		<link rel="stylesheet" type="text/css" media="screen" href="css/theme.css" />
	</head>
	<body class="v5 l_fr_FR consult sidebar_two content_slim submenu_container" id="blog">
	<div id="global" class="skyrock">
		<div id="wrapper" class="container clearfix blog">
			<div id="barleft">
				<ul id="switchitem">
					<li id="currentbp" class="fullwidth donot-getstyle">
						<a title="Blog" href="#" itemprop="url">Blog</a>
					</li>
				</ul>
				<div class="sidebar" id="sidebar-left">
					<div id="blogwhois" class="sidebar-info-bloc">`;

	html += tpl('sidebar_left', {title: blog.title, username, description: blog.description});

	html += `
				</div>
			</div>
		</div>
		<div id="barright">
			<div class="sidebar" id="sidebar-right">`;

	html += tpl('sidebar_right', {
		'date_created': date_format(blog.created_at),
		'date_updated': date_format(blog.updated_at),
		'nb_posts': blog.nb_posts,
		'nb_comments': blog.nb_comments,
		'nb_friends': blog.nb_friends,
		'nb_visits': blog.nb_visits,
	});

	html += `
			</div>
		</div>
		<div id="blogcontent" class="submenu_container clearfix">
			<div id="articles_container" class="clearfix">`;

	zip.file('css/common.css', await req('https://static.skyrock.net/css/common.css'));
	zip.file('css/tpl.css', await req('https://static.skyrock.net/css/blogs/tpl.css'));
	zip.file('css/theme.css', await req('https://static.skyrock.net/css/blogs/' + blog.id_skin + '.css'));

	zip.file('json/blog.json', JSON.stringify(blog, null, "\t"));

	$('#progress').style.display = 'block';
	$('form').style.display = 'none';
	$('#posts').max = blog.nb_posts;
	$('#posts').value = 0;

	if (blog.avatar_url) {
		images['avatar.png'] = blog.avatar_url;
	}

	for (var p = 1; p <= last_page; p++) {
		var posts_html = await api('v2/blog/list_posts', {username, 'page': p});

		if (posts_html === null) {
			alert('Vous avez dépassé le nombre de requêtes autorisées. Le blog sera incomplet.');
			break;
		}

		var posts_bbcode = options.bbcode ? await api('v2/blog/list_posts', {username, 'page': p, 'output_format': 'bbcode'}): null;

		// Reverse order
		posts_html = arrayReverseObj(posts_html.posts);

		for (var k in posts_html) {
			var post = posts_html[k];
			var id_post = post.id_post;
			post.text_bbcode = options.bbcode && id_post in posts_bbcode.posts ? posts_bbcode.posts[id_post].text : null;
			post.title_bbcode = options.bbcode && id_post in posts_bbcode.posts ? posts_bbcode.posts[id_post].title : null;
			post.medias = [];
			post.comments = [];
			post.image = null;

			if (options.images) {
				post.medias = await api('v2/blog/list_post_medias', {username, 'id_post': id_post}) || [];
			}

			var align = post.media_align.match(/left|right|center/)[0] ?? 'center';
			var images_in_text = false;

			// Multiple images
			var text = post.text.replace(/<a href="https.*?id_article_media=(\d+)"[^>]*?>.*?<img[^>]*?class="([^"]+?)"[^>]*?>.*?<\/a>/g,
				(m, id_media, css_class) => {

				if (!options.images) {
					return '';
				}

				var ext = m.match(/\.(jpe?g|png|gif)/)[1];
				var w = (a = m.match(/;w=(\d+)/)) ? a[1] : 600;
				var h = (a = m.match(/;h=(\d+)/)) ? a[1] : 800;
				var name = id_post + '_' + id_media + '.' + ext;
				images_in_text = true;

				return `<img src="images/${name}" class="${css_class}" alt="" style="object-fit: cover; width: ${w}px; height: ${h}px;" />`;
			});

			Object.values(post.medias).forEach((media) => {
				if (media.media_type != 'image') {
					console.log('Dismiss media', media);
					return;
				}

				var url = media.media_url.replace(/_small/, '');
				var ext = media.media_url.match(/\.(jpe?g|png|gif)/)[1] ?? 'img';
				var name = id_post + '_' + media.id_media + '.' + ext;
				images[name] = url;
				post.image = name;
			});

			var thumb = '';

			if (!images_in_text && post.medias.length > 0) {
				if (post.image && post.medias.length == 1 && post.medias[0].media_type == 'image') {
					// Image
					thumb = '<div class="image-container ' + align + '"><img src="images/' + post.image + '" alt="" style="max-width: 600px; max-height: 800px;" /></div>';
				}
				else if (post.medias.length > 0) {
					// Videos, etc.
					thumb = '<div class="image-container ' + align + '">' + post.medias[0].media_html + '</div>';
				}
			}

			var comments = '';

			if (options.comments && post.nb_comments && blog.comments_enabled) {
				var last_comment_page = 1;

				comments += `
					<div class="article_content_menu clearfix donot-getstyle">
						<ul>
							<li><span class="title_tooltip">Commentaires<span class="pointe_border"></span></span></li>
						</ul>
					</div>
					<div id="secondary_content" class="clear_bloc clearfix">
						<div id="blogcomments">
							<div>`;

				for (var cp = 1; cp <= last_comment_page; cp++) {
					var post_comments = await api('v2/blog/list_post_comments', {username, 'id_post': id_post, 'page': cp});

					if (null === post_comments) {
						break;
					}

					last_comment_page = post_comments.max_page;

					for (var id_comment in post_comments.comments) {
						if (!post_comments.comments.hasOwnProperty(id_comment)) {
							continue;
						}

						var comment = post_comments.comments[id_comment];
						post.comments.push(comment);
						comments += tpl('comment', {
							'username': comment.author.username,
							'date': date_format(comment.date),
							'comment': comment.content
						});
					}

				}

				comments += `
						</div>
					</div>
				</div>`;
			}

			html += tpl('post', {
				'id_post': id_post,
				'title': post.title,
				'text': text,
				'class': post.medias.length == 0 ? 'isText' : 'hasimage',
				'thumbnail': thumb,
				'created_at': date_format(post.created_at),
				'updated_at': date_format(post.updated_at),
				comments
			});

			posts.push(post);
			zip.file('json/post_' + id_post + '.json', JSON.stringify(post, null, "\t"));
			$('#posts').value++;
		}
	}

	$('#images').max = Object.keys(images).length;

	html += `
			</div>
		</div>
	</div>
	</body>
	</html>`;

	zip.file('index.html', html);

	for (var path in images) {
		$('#images').value++;
		console.log('Zipping', path, 'from', images[path]);

		try {
			var blob = await reqBlob(images[path]);
			zip.file('images/' + path, blob);
		}
		catch (e) {
			console.error(e);
		}
	}

	// Save ZIP
	zip.generateAsync({type: "blob"}).then(function (blob) {
		var temp_object_url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.style.display = 'none';
		a.href = temp_object_url;
		a.download = username + '.zip';

		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(temp_object_url);
		a.remove();

	}, function (err) {
		alert(err);
	});

	$('#progress').style.display = 'none';
	$('#finished').style.display = 'block';
}

window.onload = () => {
	$('form').onsubmit = () => {
		var username = $('#f_username').value.replace(/\s+/, '');

		if (!username) {
			alert('Pseudo vide !');
			return;
		}

		archive(username, {
			'images': $('#f_images').checked,
			'bbcode': $('#f_bbcode').checked,
			'comments': $('#f_comments').checked
		});

		return false;
	};

	$('#f_username').focus();
};