var api = async (url, params) => {
	var params_str = '';

	if (typeof params == 'object' && params !== null) {
		Object.entries(params).forEach((e) => {
			params_str += e[0] + '=' + encodeURIComponent(e[1]) + '&';
		})
	}

	url = 'https://api.skyrock.com/' + url + '.json?' + params_str;
	console.log('Requesting', url);
	var r = await fetch(url);
	var j = await r.json();

	if (!r.ok) {
		throw Error(j.error ? j.error : url + ': ' + r.statusText + "\n" + JSON.stringify(j, null, "\t"));
	}

	return j;
};

const imageUrlToBase64 = async url => {
	const response = await fetch(url);
	const blob = await response.blob();
	return new Promise((onSuccess, onError) => {
		try {
			const reader = new FileReader() ;
			reader.onload = function(){ onSuccess(this.result) } ;
			reader.readAsDataURL(blob) ;
		} catch(e) {
			onError(e);
		}
	});
};

var zip = new JSZip();

async function archive(username)
{
	try {
		var blog = await api('v2/blog/get', {username});
	}
	catch (e) {
		alert('Blog introuvable' + "\n" + e);
	}

	var images = [];
	var posts = [];

	if (!blog.nb_posts) {
		alert('Ce blog n\'a aucun article.');
		return;
	}

	console.log(blog);

	zip.file('json/blog.json', JSON.stringify(blog, null, "\t"));

	document.getElementById('progress').style.display = 'block';
	document.querySelector('form').style.display = 'none';
	document.getElementById('posts').max = blog.nb_posts;
	document.getElementById('posts').value = 0;

	images.push(blog.avatar_big_url);

	var last_page = Math.ceil(blog.nb_posts / 10);

	for (var p = 1; p <= last_page; p++) {
		var posts_html = await api('v2/blog/list_posts', {username, 'page': p});
		var posts_bbcode = await api('v2/blog/list_posts', {username, 'page': p, 'output_format': 'bbcode'});

		for (var id_post in posts_html.posts) {
			if (!posts_html.posts.hasOwnProperty(id_post)) {
				continue;
			}

			var post = posts_html.posts[id_post];
			post.text_bbcode = posts_bbcode.posts[id_post].text;
			post.title_bbcode = posts_bbcode.posts[id_post].title;
			post.medias = await api('v2/blog/list_post_medias', {username, 'id_post': id_post});
			post.comments = [];

			Object.values(post.medias).forEach((media) => {
				if (media.media_type != 'image') {
					console.log('Dismiss media', media);
					return;
				}

				var url = media.media_url.replace(/_small/, '');
				images.push(url);
			})

			if (post.nb_comments && blog.comments_enabled) {
				var last_comment_page = 1;

				for (var cp = 1; cp <= last_comment_page; cp++) {
					try {
						var comments = await api('v2/blog/list_post_comments', {username, 'id_post': id_post, 'page': cp});
					}
					catch (e) {
						break;
					}

					last_comment_page = comments.max_page;

					for (var id_comment in comments.comments) {
						if (!comments.comments.hasOwnProperty(id_comment)) {
							continue;
						}
					}

					post.comments.push(comments.comments[id_comment]);
				}
			}

			posts.push(post);
			zip.file('json/post_' + id_post + '.json', JSON.stringify(post, null, "\t"));
			document.getElementById('posts').value++;
		}

		console.log(posts);
		break;
	}

	document.getElementById('images').max = images.length;

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
}

window.onload = () => {
	document.querySelector('form').onsubmit = () => {
		var username = document.getElementById('f_username').value.replace(/\s+/, '');

		if (!username) {
			alert('Pseudo vide !');
			return;
		}

		archive(username);
		return false;
	};
};