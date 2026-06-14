const { parseGraphqlBody } = require("./facebook-graphql-parser");

describe("Facebook GraphQL feed parser", () => {
  it("extracts ordered content and all album images", () => {
    const body = JSON.stringify({
      data: {
        node: {
          timeline_list_feed_units: {
            edges: [{
              node: {
                __typename: "Story",
                post_id: "123",
                feedback: { owning_profile: { id: "42", name: "Ecohome" } },
                comet_sections: {
                  content: { story: { message_container: { story: { message: { text: "Full post caption" } } } } },
                  metadata: [{ story: { creation_time: 1710000000, url: "https://www.facebook.com/ecohome/posts/pfbid123" } }],
                  feedback: {
                    story: {
                      story_ufi_container: {
                        story: {
                          feedback: {
                            action_renderers: [
                              {
                                __typename: "UFIReactionActionRenderer",
                                feedback: { reaction_count: { count: 12 } },
                              },
                              {
                                __typename: "UFICommentActionRenderer",
                                feedback: {
                                  comment_rendering_instance: {
                                    comments: { total_count: 3 },
                                  },
                                },
                              },
                              {
                                __typename: "XFBUFIAdaptiveShareActionRenderer",
                                feedback: { share_count: { count: 4 } },
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
                attachments: [{
                  styles: {
                    attachment: {
                      all_subattachments: {
                        nodes: [
                          { media: { __typename: "Photo", id: "1", viewer_image: { uri: "https://scontent.fbcdn.net/1.jpg" } } },
                          { media: { __typename: "Photo", id: "2", viewer_image: { uri: "https://scontent.fbcdn.net/2.jpg" } } },
                        ],
                      },
                    },
                  },
                }],
              },
            }],
          },
        },
      },
    });

    const [post] = parseGraphqlBody(body);
    expect(post.id).toBe("123");
    expect(post.fullContent).toBe("Full post caption");
    expect(post.mediaUrls).toEqual([
      "https://scontent.fbcdn.net/1.jpg",
      "https://scontent.fbcdn.net/2.jpg",
    ]);
    expect(post.mediaType).toBe("carousel");
    expect(post.permalink).toBe("https://www.facebook.com/ecohome/posts/pfbid123");
    expect(post.likes).toBe(12);
    expect(post.comments).toBe(3);
    expect(post.shares).toBe(4);
  });

  it("extracts reel metadata and keeps its permalink as video fallback", () => {
    const body = JSON.stringify({
      data: {
        node: {
          timeline_list_feed_units: {
            edges: [{
              node: {
                __typename: "Story",
                post_id: "456",
                comet_sections: {
                  content: { story: { message_container: { story: { message: { text: "Reel caption" } } } } },
                  metadata: [{ story: { creation_time: 1710000100, url: "https://www.facebook.com/reel/987/" } }],
                },
                attachments: [{
                  media: { __typename: "Video", id: "987" },
                  styles: {
                    attachment: {
                      media: {
                        first_frame_thumbnail: "https://scontent.fbcdn.net/thumb.jpg",
                        progressive_urls: [
                          { progressive_url: "https://video.fbcdn.net/sd.mp4", metadata: { quality: "SD" } },
                          { progressive_url: "https://video.fbcdn.net/hd.mp4", metadata: { quality: "HD" } },
                        ],
                        captions_url: "https://scontent.fbcdn.net/captions.srt",
                      },
                    },
                  },
                }],
              },
            }],
          },
        },
      },
    });

    const [post] = parseGraphqlBody(body);
    expect(post.mediaType).toBe("video");
    expect(post.videoUrls).toEqual(["https://video.fbcdn.net/hd.mp4"]);
    expect(post.fullPicture).toBe("https://scontent.fbcdn.net/thumb.jpg");
    expect(post.mediaUrls).not.toContain("https://scontent.fbcdn.net/captions.srt");
  });
});
