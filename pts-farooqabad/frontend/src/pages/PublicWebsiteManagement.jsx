import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileImageOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
  VideoCameraOutlined,
  WarningOutlined,
} from "@ant-design/icons";

import api from "../services/api";
import { resolvePublicGoogleMapsUrl } from "../utils/publicGoogleMapsUrl";

import "../publicCms.css";


const {
  Title,
  Text,
} = Typography;


const MEDIA_CATEGORIES = [
  "BRAND",
  "HERO",
  "ABOUT",
  "PRINCIPAL",
  "LEADERSHIP",
  "FACILITY",
  "GALLERY",
  "TENDER",
  "VIDEO",
  "OTHER",
];


const ICON_OPTIONS = [
  {
    value:
      "TROPHY",
    label:
      "Trophy / Drill",
  },
  {
    value:
      "READ",
    label:
      "Reading / Law",
  },
  {
    value:
      "TEAM",
    label:
      "Team",
  },
  {
    value:
      "CAR",
    label:
      "Vehicle",
  },
  {
    value:
      "LAPTOP",
    label:
      "Digital",
  },
  {
    value:
      "SAFETY",
    label:
      "Safety",
  },
  {
    value:
      "BANK",
    label:
      "Building",
  },
  {
    value:
      "BOOK",
    label:
      "Book",
  },
  {
    value:
      "CHECK",
    label:
      "Check",
  },
];


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function clone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function getAtPath(
  object,
  path
) {
  return path.reduce(
    (
      current,
      key
    ) =>
      current?.[
        key
      ],
    object
  );
}


function setAtPath(
  object,
  path,
  value
) {
  const copy =
    clone(
      object
    );

  let current =
    copy;

  for (
    let index = 0;
    index <
    path.length - 1;
    index +=
      1
  ) {
    const key =
      path[index];

    if (
      current[key] ===
        undefined ||
      current[key] ===
        null
    ) {
      current[key] =
        typeof path[
          index +
            1
        ] ===
        "number"
          ? []
          : {};
    }

    current =
      current[key];
  }

  current[
    path[
      path.length -
        1
    ]
  ] =
    value;

  return copy;
}


function mediaUrl(
  item
) {
  if (!item?.url) {
    return null;
  }

  if (
    /^https?:\/\//i.test(
      item.url
    )
  ) {
    return item.url;
  }

  const base =
    String(
      api.defaults
        .baseURL ||
        "/api/v1"
    ).replace(
      /\/$/,
      ""
    );

  return `${base}${
    item.url.startsWith(
      "/"
    )
      ? item.url
      : `/${item.url}`
  }`;
}


/*
|--------------------------------------------------------------------------
| INLINE MEDIA FIELD
|--------------------------------------------------------------------------
|
| Ab jis jagah image/video use hoti hai,
| wahi:
|
| - Current Preview
| - Upload New
| - Select Existing
| - Remove From Section
|
| available hoga.
|
|--------------------------------------------------------------------------
*/

function InlineMediaField({
  media,
  value,
  category,
  title,
  mediaType =
    "IMAGE",
  onChange,
  onUpload,
  helpText = null,
}) {
  const currentMedia =
    media.find(
      (
        item
      ) =>
        Number(
          item.id
        ) ===
        Number(
          value
        )
    ) ||
    null;


  const availableMedia =
    media
      .filter(
        (
          item
        ) =>
          item.media_type ===
            mediaType
      )
      .map(
        (
          item
        ) => ({
          value:
            Number(
              item.id
            ),

          label:
            `${
              item.title ||
              `Media #${item.id}`
            } — ${
              item.category
            }${
              item.is_active
                ? ""
                : " (Hidden)"
            }`,
        })
      );


  const accept =
    mediaType ===
    "VIDEO"
      ? ".mp4,.webm"
      : ".jpg,.jpeg,.png,.webp";


  return (
    <div className="public-cms-inline-media">

      <div className="public-cms-inline-preview">
        {currentMedia ? (
          currentMedia.media_type ===
          "VIDEO" ? (
            <video
              src={
                mediaUrl(
                  currentMedia
                )
              }
              controls
              preload="metadata"
            />
          ) : (
            <Image
              src={
                mediaUrl(
                  currentMedia
                )
              }
              preview
            />
          )
        ) : (
          <div className="public-cms-inline-placeholder">
            {mediaType ===
            "VIDEO" ? (
              <VideoCameraOutlined />
            ) : (
              <FileImageOutlined />
            )}

            <span>
              No {mediaType ===
              "VIDEO"
                ? "video"
                : "picture"} selected
            </span>
          </div>
        )}
      </div>


      <div className="public-cms-inline-controls">

        <Text strong>
          {title}
        </Text>


        {helpText && (
          <Text
            type="secondary"
            className="public-cms-inline-help"
          >
            {helpText}
          </Text>
        )}


        <Upload
          showUploadList={
            false
          }
          accept={
            accept
          }
          customRequest={({
            file,
            onSuccess,
            onError,
          }) =>
            onUpload({
              file,
              category,
              title,
              onSuccess,
              onError,
              assign:
                onChange,
            })
          }
        >
          <Button
            type="primary"
            icon={
              <UploadOutlined />
            }
          >
            {currentMedia
              ? mediaType ===
                "VIDEO"
                ? "Upload New Video"
                : "Upload New Picture"
              : mediaType ===
                "VIDEO"
                ? "Upload Video"
                : "Upload Picture"}
          </Button>
        </Upload>


        <div className="public-cms-or">
          OR SELECT FROM MEDIA LIBRARY
        </div>


        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={
            mediaType ===
            "VIDEO"
              ? "Select existing video"
              : "Select existing picture"
          }
          value={
            value
              ? Number(
                  value
                )
              : null
          }
          options={
            availableMedia
          }
          onChange={(
            selected
          ) =>
            onChange(
              selected ||
                null
            )
          }
          style={{
            width:
              "100%",
          }}
        />


        {currentMedia && (
          <Button
            danger
            type="link"
            icon={
              <DeleteOutlined />
            }
            className="public-cms-remove-selection"
            onClick={() =>
              onChange(
                null
              )
            }
          >
            Remove Picture From This Section
          </Button>
        )}

      </div>
    </div>
  );
}


/*
|--------------------------------------------------------------------------
| PUBLIC WEBSITE MANAGEMENT
|--------------------------------------------------------------------------
*/

export default function PublicWebsiteManagement() {
  const [
    mediaForm,
  ] =
    Form.useForm();


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );


  const [
    content,
    setContent,
  ] =
    useState(
      null
    );


  const [
    media,
    setMedia,
  ] =
    useState([]);


  const [
    isDirty,
    setIsDirty,
  ] =
    useState(
      false
    );


  const [
    activeTab,
    setActiveTab,
  ] =
    useState(
      "branding"
    );


  const [
    mediaModalOpen,
    setMediaModalOpen,
  ] =
    useState(
      false
    );


  const [
    selectedMedia,
    setSelectedMedia,
  ] =
    useState(
      null
    );


  const [
    galleryTitle,
    setGalleryTitle,
  ] =
    useState("");


  const [
    galleryCaption,
    setGalleryCaption,
  ] =
    useState("");


  const initialContentRef =
    useRef(
      null
    );


  /*
  |--------------------------------------------------------------------------
  | UNSAVED WARNING
  |--------------------------------------------------------------------------
  */

  useEffect(
    () => {
      const handleBeforeUnload =
        (
          event
        ) => {
          if (
            !isDirty
          ) {
            return;
          }

          event.preventDefault();

          event.returnValue =
            "";
        };


      window.addEventListener(
        "beforeunload",
        handleBeforeUnload
      );


      return () => {
        window.removeEventListener(
          "beforeunload",
          handleBeforeUnload
        );
      };
    },
    [
      isDirty,
    ]
  );


  /*
  |--------------------------------------------------------------------------
  | LOAD
  |--------------------------------------------------------------------------
  */

  const loadData =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const response =
            await api.get(
              "/public-site/admin"
            );


          const data =
            response.data
              ?.data ||
            {};


          const loadedContent =
            data.content ||
            null;


          setContent(
            loadedContent
          );


          initialContentRef.current =
            loadedContent
              ? clone(
                  loadedContent
                )
              : null;


          setMedia(
            Array.isArray(
              data.media
            )
              ? data.media
              : []
          );


          setIsDirty(
            false
          );

        } catch (error) {
          message.error(
            error.response
              ?.data
              ?.message ||
              "Could not load Public Website Management."
          );

        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );


  useEffect(
    () => {
      loadData();
    },
    [
      loadData,
    ]
  );


  /*
  |--------------------------------------------------------------------------
  | CONTENT CHANGES
  |--------------------------------------------------------------------------
  */

  const updateValue =
    (
      path,
      value
    ) => {
      setContent(
        (
          previous
        ) =>
          setAtPath(
            previous,
            path,
            value
          )
      );

      setIsDirty(
        true
      );
    };


  const updateArrayItem =
    (
      path,
      index,
      field,
      value
    ) => {
      setContent(
        (
          previous
        ) => {
          const next =
            clone(
              previous
            );

          const array =
            getAtPath(
              next,
              path
            );

          array[
            index
          ] = {
            ...array[
              index
            ],

            [field]:
              value,
          };

          return next;
        }
      );

      setIsDirty(
        true
      );
    };


  const addArrayItem =
    (
      path,
      item
    ) => {
      setContent(
        (
          previous
        ) => {
          const next =
            clone(
              previous
            );

          const array =
            getAtPath(
              next,
              path
            );

          array.push(
            item
          );

          return next;
        }
      );

      setIsDirty(
        true
      );
    };


  const removeArrayItem =
    (
      path,
      index
    ) => {
      setContent(
        (
          previous
        ) => {
          const next =
            clone(
              previous
            );

          const array =
            getAtPath(
              next,
              path
            );

          array.splice(
            index,
            1
          );

          return next;
        }
      );

      setIsDirty(
        true
      );
    };


  const moveArrayItem =
    (
      path,
      index,
      direction
    ) => {
      setContent(
        (
          previous
        ) => {
          const next =
            clone(
              previous
            );

          const array =
            getAtPath(
              next,
              path
            );

          const target =
            index +
            direction;


          if (
            target <
              0 ||
            target >=
              array.length
          ) {
            return previous;
          }


          [
            array[index],
            array[target],
          ] = [
            array[target],
            array[index],
          ];


          return next;
        }
      );

      setIsDirty(
        true
      );
    };


  /*
  |--------------------------------------------------------------------------
  | SAVE CONTENT
  |--------------------------------------------------------------------------
  */

  const saveContent =
    async ({
      showMessage =
        true,
    } = {}) => {
      if (!content) {
        return false;
      }


      setSaving(
        true
      );


      try {
        const response =
          await api.put(
            "/public-site/admin/content",
            {
              content,
            }
          );


        const savedContent =
          response.data
            ?.data ||
          content;


        setContent(
          savedContent
        );


        initialContentRef.current =
          clone(
            savedContent
          );


        setIsDirty(
          false
        );


        if (
          showMessage
        ) {
          message.success(
            "Public website saved successfully."
          );
        }


        return true;

      } catch (error) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not save public website."
        );


        return false;

      } finally {
        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | INLINE MEDIA UPLOAD
  |--------------------------------------------------------------------------
  */

  const uploadInlineMedia =
    async ({
      file,
      category,
      title,
      onSuccess,
      onError,
      assign,
    }) => {
      try {
        const formData =
          new FormData();


        formData.append(
          "file",
          file
        );


        formData.append(
          "category",
          category
        );


        formData.append(
          "title",
          title ||
            file.name
        );


        formData.append(
          "caption",
          ""
        );


        const response =
          await api.post(
            "/public-site/admin/media",
            formData
          );


        const item =
          response.data
            ?.data;


        if (!item) {
          throw new Error(
            "Uploaded media was not returned by server."
          );
        }


        setMedia(
          (
            previous
          ) => [
            item,
            ...previous,
          ]
        );


        /*
        |----------------------------------------------------------------------
        | Automatically assign uploaded media to this exact section
        |----------------------------------------------------------------------
        */

        assign(
          Number(
            item.id
          )
        );


        message.success(
          "Picture uploaded and selected. Click Save Website to publish it."
        );


        onSuccess?.(
          response.data
        );

      } catch (error) {
        message.error(
          error.response
            ?.data
            ?.message ||
            error.message ||
            "Picture upload failed."
        );


        onError?.(
          error
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | GALLERY DIRECT UPLOAD
  |--------------------------------------------------------------------------
  */

  const uploadGalleryMedia =
    async ({
      file,
      onSuccess,
      onError,
    }) => {
      try {
        const formData =
          new FormData();


        formData.append(
          "file",
          file
        );


        formData.append(
          "category",
          "GALLERY"
        );


        formData.append(
          "title",
          galleryTitle ||
            file.name
        );


        formData.append(
          "caption",
          galleryCaption
        );


        const response =
          await api.post(
            "/public-site/admin/media",
            formData
          );


        const item =
          response.data
            ?.data;


        if (item) {
          setMedia(
            (
              previous
            ) => [
              item,
              ...previous,
            ]
          );
        }


        setGalleryTitle(
          ""
        );


        setGalleryCaption(
          ""
        );


        message.success(
          "Gallery picture uploaded successfully."
        );


        onSuccess?.(
          response.data
        );

      } catch (error) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Gallery picture upload failed."
        );


        onError?.(
          error
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | PREVIEW
  |--------------------------------------------------------------------------
  */

  const openPreview =
    () => {
      const previewUrl =
        `${window.location.origin}${window.location.pathname}?public=1`;


      window.open(
        previewUrl,
        "_blank",
        "noopener,noreferrer"
      );
    };


  const saveAndPreview =
    async () => {
      const saved =
        await saveContent({
          showMessage:
            false,
        });


      if (!saved) {
        return;
      }


      message.success(
        "Website saved. Opening preview..."
      );


      openPreview();
    };


  /*
  |--------------------------------------------------------------------------
  | REFRESH / DISCARD
  |--------------------------------------------------------------------------
  */

  const refreshWebsiteData =
    () => {
      if (
        !isDirty
      ) {
        loadData();

        return;
      }


      Modal.confirm({
        title:
          "Discard unsaved changes?",

        icon:
          <WarningOutlined />,

        content:
          "You have unsaved website changes. Refreshing will discard them.",

        okText:
          "Discard & Refresh",

        okType:
          "danger",

        cancelText:
          "Keep Editing",

        onOk:
          loadData,
      });
    };


  const discardChanges =
    () => {
      if (
        !isDirty ||
        !initialContentRef.current
      ) {
        return;
      }


      Modal.confirm({
        title:
          "Discard Changes?",

        content:
          "All unsaved changes made since the last save will be removed.",

        okText:
          "Discard",

        okType:
          "danger",

        onOk() {
          setContent(
            clone(
              initialContentRef.current
            )
          );

          setIsDirty(
            false
          );

          message.success(
            "Unsaved changes discarded."
          );
        },
      });
    };


  /*
  |--------------------------------------------------------------------------
  | MEDIA EDIT
  |--------------------------------------------------------------------------
  */

  const openMediaEdit =
    (
      item
    ) => {
      setSelectedMedia(
        item
      );


      mediaForm.setFieldsValue({
        title:
          item.title,

        caption:
          item.caption,

        category:
          item.category,

        sort_order:
          Number(
            item.sort_order ||
            0
          ),

        is_active:
          Boolean(
            item.is_active
          ),
      });


      setMediaModalOpen(
        true
      );
    };


  const saveMediaEdit =
    async () => {
      try {
        const values =
          await mediaForm.validateFields();


        setSaving(
          true
        );


        const response =
          await api.put(
            `/public-site/admin/media/${selectedMedia.id}`,
            values
          );


        const updated =
          response.data
            ?.data;


        setMedia(
          (
            previous
          ) =>
            previous.map(
              (
                item
              ) =>
                Number(
                  item.id
                ) ===
                Number(
                  updated.id
                )
                  ? updated
                  : item
            )
        );


        setMediaModalOpen(
          false
        );


        message.success(
          "Media updated successfully."
        );

      } catch (error) {
        if (
          error
            ?.errorFields
        ) {
          return;
        }


        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not update media."
        );

      } finally {
        setSaving(
          false
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | REPLACE MEDIA LIBRARY FILE
  |--------------------------------------------------------------------------
  */

  const replaceMedia =
    (
      item
    ) =>
    async ({
      file,
      onSuccess,
      onError,
    }) => {
      try {
        const formData =
          new FormData();


        formData.append(
          "file",
          file
        );


        const response =
          await api.post(
            `/public-site/admin/media/${item.id}/replace`,
            formData
          );


        const updated =
          response.data
            ?.data;


        setMedia(
          (
            previous
          ) =>
            previous.map(
              (
                row
              ) =>
                Number(
                  row.id
                ) ===
                Number(
                  updated.id
                )
                  ? updated
                  : row
            )
        );


        message.success(
          "Media file replaced successfully."
        );


        onSuccess?.(
          response.data
        );

      } catch (error) {
        message.error(
          error.response
            ?.data
            ?.message ||
            "Could not replace media."
        );


        onError?.(
          error
        );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | DELETE MEDIA
  |--------------------------------------------------------------------------
  */

  const deleteMedia =
    (
      item
    ) => {
      Modal.confirm({
        title:
          "Delete Media?",

        content:
          "This media file will be permanently removed. Website references to it will also be cleared.",

        okText:
          "Delete",

        okType:
          "danger",

        async onOk() {
          try {
            await api.delete(
              `/public-site/admin/media/${item.id}`
            );


            await loadData();


            message.success(
              "Media deleted successfully."
            );

          } catch (error) {
            message.error(
              error.response
                ?.data
                ?.message ||
                "Could not delete media."
            );
          }
        },
      });
    };


  /*
  |--------------------------------------------------------------------------
  | GALLERY
  |--------------------------------------------------------------------------
  */

  const galleryMedia =
    useMemo(
      () =>
        media
          .filter(
            (
              item
            ) =>
              item.category ===
              "GALLERY"
          )
          .sort(
            (
              first,
              second
            ) =>
              Number(
                first.sort_order ||
                0
              ) -
              Number(
                second.sort_order ||
                0
              )
          ),
      [
        media,
      ]
    );


  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (
    loading
  ) {
    return (
      <div className="public-cms-loader">
        <Spin size="large" />

        <Text type="secondary">
          Loading Public Website...
        </Text>
      </div>
    );
  }


  if (!content) {
    return (
      <Alert
        type="error"
        showIcon
        message="Public website content could not be loaded."
      />
    );
  }


  /*
  |--------------------------------------------------------------------------
  | REORDER BUTTONS
  |--------------------------------------------------------------------------
  */

  const reorderButtons =
    (
      path,
      index,
      total
    ) => (
      <Space>
        <Button
          size="small"
          icon={
            <ArrowUpOutlined />
          }
          disabled={
            index ===
            0
          }
          onClick={() =>
            moveArrayItem(
              path,
              index,
              -1
            )
          }
        />

        <Button
          size="small"
          icon={
            <ArrowDownOutlined />
          }
          disabled={
            index ===
            total -
              1
          }
          onClick={() =>
            moveArrayItem(
              path,
              index,
              1
            )
          }
        />

        <Button
          size="small"
          danger
          icon={
            <DeleteOutlined />
          }
          onClick={() =>
            removeArrayItem(
              path,
              index
            )
          }
        />
      </Space>
    );


  /*
  |--------------------------------------------------------------------------
  | TABS
  |--------------------------------------------------------------------------
  */

  const tabs = [
    {
      key: "news-tenders",
      label: "News & Tenders",
      children: (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card
            title="Moving News Updates"
            extra={<Button icon={<PlusOutlined />} type="primary" onClick={() => addArrayItem(["news_updates"], { text: "", is_active: true })}>Add News</Button>}
          >
            <Text type="secondary">Updates move from right to left on the public homepage. Unpublished items stay hidden.</Text>
            {(content.news_updates || []).map((item, index) => (
              <Card size="small" key={index} style={{ marginTop: 15 }}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Input.TextArea value={item.text || ""} rows={2} maxLength={450} showCount
                    placeholder="Official news, announcement or notice"
                    onChange={(event) => updateArrayItem(["news_updates"], index, "text", event.target.value)} />
                  <Space wrap>
                    <Switch checked={item.is_active !== false} checkedChildren="Published" unCheckedChildren="Hidden"
                      onChange={(value) => updateArrayItem(["news_updates"], index, "is_active", value)} />
                    {reorderButtons(["news_updates"], index, (content.news_updates || []).length)}
                  </Space>
                </Space>
              </Card>
            ))}
            {!content.news_updates?.length && <Alert type="info" showIcon style={{ marginTop: 15 }} message="No news updates yet. Add an official announcement to start the moving news strip." />}
          </Card>
          <Card
            title="Tender Advertisements"
            extra={<Button icon={<PlusOutlined />} type="primary"
              onClick={() => addArrayItem(["tenders"], { id: `tender-${Date.now()}`, title: "", description: "", date: "", image_media_id: null, is_active: false })}>Add Tender</Button>}
          >
            <Text type="secondary">Upload the advertisement image, enter its title and description, then enable Published and click Save Website. The public Tenders page lists published notices only.</Text>
            {(content.tenders || []).map((item, index) => (
              <Card size="small" key={item.id || index} title={`Tender ${index + 1}`} style={{ marginTop: 15 }}>
                <Form.Item label="Tender Title" required>
                  <Input value={item.title || ""} maxLength={220} placeholder="Tender / Procurement Notice"
                    onChange={(event) => updateArrayItem(["tenders"], index, "title", event.target.value)} />
                </Form.Item>
                <Form.Item label="Advertisement / Publication Date">
                  <Input type="date" value={item.date || ""} onChange={(event) => updateArrayItem(["tenders"], index, "date", event.target.value)} />
                </Form.Item>
                <Form.Item label="Tender Description">
                  <Input.TextArea value={item.description || ""} rows={5} maxLength={6000} showCount
                    placeholder="Scope, eligibility, submission date, instructions and other details as per official advertisement"
                    onChange={(event) => updateArrayItem(["tenders"], index, "description", event.target.value)} />
                </Form.Item>
                <InlineMediaField media={media} value={item.image_media_id} category="TENDER"
                  title="Tender Advertisement Image" helpText="Upload JPG, PNG or WEBP. Visitors can open the full image on the Tenders page."
                  onChange={(value) => updateArrayItem(["tenders"], index, "image_media_id", value)} onUpload={uploadInlineMedia} />
                <Space wrap style={{ marginTop: 16 }}>
                  <Switch checked={item.is_active === true} checkedChildren="Published" unCheckedChildren="Draft"
                    onChange={(value) => updateArrayItem(["tenders"], index, "is_active", value)} />
                  {reorderButtons(["tenders"], index, (content.tenders || []).length)}
                </Space>
              </Card>
            ))}
            {!content.tenders?.length && <Alert type="info" showIcon style={{ marginTop: 15 }} message="No tenders published. Create a notice and upload its advertisement here." />}
          </Card>
          <Alert showIcon type="info" message="Publishing" description="Use Save Website at the top to publish your news and tender changes. Tender images upload immediately but are visible on the public page only after the tender is published and saved." />
        </Space>
      ),
    },

    /*
    |--------------------------------------------------------------------------
    | BRANDING & HERO
    |--------------------------------------------------------------------------
    */

    {
      key:
        "branding",

      label:
        "Branding & Hero",

      children: (
        <Space
          direction="vertical"
          size="large"
          style={{
            width:
              "100%",
          }}
        >
          <Card title="Website Branding">
            <Row gutter={16}>
              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="School Name">
                  <Input
                    value={
                      content.brand
                        ?.school_name
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "brand",
                          "school_name",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Short Name">
                  <Input
                    value={
                      content.brand
                        ?.short_name
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "brand",
                          "short_name",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Department">
                  <Input
                    value={
                      content.brand
                        ?.department
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "brand",
                          "department",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Motto">
                  <Input
                    value={
                      content.brand
                        ?.motto
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "brand",
                          "motto",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>
            </Row>


            <Divider>
              PTS Logo
            </Divider>


            <InlineMediaField
              media={
                media
              }
              value={
                content.brand
                  ?.logo_media_id
              }
              category="BRAND"
              title="PTS Logo"
              helpText="Navbar, hero and footer mein use hone wala official PTS logo."
              onChange={(
                value
              ) =>
                updateValue(
                  [
                    "brand",
                    "logo_media_id",
                  ],
                  value
                )
              }
              onUpload={
                uploadInlineMedia
              }
            />
          </Card>


          <Card title="Hero / Homepage Intro">
            <Row gutter={16}>
              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Small Heading">
                  <Input
                    value={
                      content.hero
                        ?.badge
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "hero",
                          "badge",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Title Line 1">
                  <Input
                    value={
                      content.hero
                        ?.title_line_1
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "hero",
                          "title_line_1",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Title Line 2">
                  <Input
                    value={
                      content.hero
                        ?.title_line_2
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "hero",
                          "title_line_2",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col span={24}>
                <Form.Item label="Description">
                  <Input.TextArea
                    rows={4}
                    value={
                      content.hero
                        ?.description
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "hero",
                          "description",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>
            </Row>


            <Divider>
              Hero Picture
            </Divider>


            <InlineMediaField
              media={
                media
              }
              value={
                content.hero
                  ?.media_id
              }
              category="HERO"
              title="Homepage Hero / Campus Picture"
              helpText="Homepage ke top-right main campus picture ke liye."
              onChange={(
                value
              ) =>
                updateValue(
                  [
                    "hero",
                    "media_id",
                  ],
                  value
                )
              }
              onUpload={
                uploadInlineMedia
              }
            />


            <Divider>
              Homepage Features
            </Divider>


            <Row gutter={16}>
              {(
                content.hero
                  ?.features ||
                []
              ).map(
                (
                  item,
                  index
                ) => (
                  <Col
                    xs={24}
                    md={8}
                    key={
                      index
                    }
                  >
                    <Input
                      value={
                        item
                      }
                      onChange={(
                        event
                      ) => {
                        const next =
                          [
                            ...content
                              .hero
                              .features,
                          ];

                        next[
                          index
                        ] =
                          event.target
                            .value;

                        updateValue(
                          [
                            "hero",
                            "features",
                          ],
                          next
                        );
                      }}
                    />
                  </Col>
                )
              )}
            </Row>


            <Divider>
              Homepage Statistics
            </Divider>


            {(
              content.stats ||
              []
            ).map(
              (
                item,
                index
              ) => (
                <Row
                  gutter={12}
                  key={
                    index
                  }
                  style={{
                    marginBottom:
                      10,
                  }}
                >
                  <Col
                    xs={24}
                    md={5}
                  >
                    <Input
                      value={
                        item.value
                      }
                      placeholder="Value"
                      onChange={(
                        event
                      ) =>
                        updateArrayItem(
                          [
                            "stats",
                          ],
                          index,
                          "value",
                          event.target
                            .value
                        )
                      }
                    />
                  </Col>

                  <Col
                    xs={24}
                    md={19}
                  >
                    <Input
                      value={
                        item.label
                      }
                      placeholder="Label"
                      onChange={(
                        event
                      ) =>
                        updateArrayItem(
                          [
                            "stats",
                          ],
                          index,
                          "label",
                          event.target
                            .value
                        )
                      }
                    />
                  </Col>
                </Row>
              )
            )}
          </Card>
        </Space>
      ),
    },


    /*
    |--------------------------------------------------------------------------
    | ABOUT & PRINCIPAL
    |--------------------------------------------------------------------------
    */

    {
      key:
        "about",

      label:
        "About & Principal",

      children: (
        <Space
          direction="vertical"
          size="large"
          style={{
            width:
              "100%",
          }}
        >
          <Card title="About Section">
            <Form.Item label="Section Label">
              <Input
                value={
                  content.about
                    ?.kicker
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "about",
                      "kicker",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>


            <Form.Item label="Heading">
              <Input
                value={
                  content.about
                    ?.title
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "about",
                      "title",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>


            <Form.Item label="Description">
              <Input.TextArea
                rows={4}
                value={
                  content.about
                    ?.description
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "about",
                      "description",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>


            <Divider>
              About / Campus Picture
            </Divider>


            <InlineMediaField
              media={
                media
              }
              value={
                content.about
                  ?.media_id
              }
              category="ABOUT"
              title="About Section Picture"
              helpText="History/About section ke left-side par dikhne wali campus picture."
              onChange={(
                value
              ) =>
                updateValue(
                  [
                    "about",
                    "media_id",
                  ],
                  value
                )
              }
              onUpload={
                uploadInlineMedia
              }
            />


            <Divider>
              History
            </Divider>


            {(
              content.about
                ?.history ||
              []
            ).map(
              (
                item,
                index
              ) => (
                <Card
                  size="small"
                  key={
                    index
                  }
                  className="public-cms-editor-card"
                  title={
                    item.title ||
                    `History ${index + 1}`
                  }
                  extra={
                    reorderButtons(
                      [
                        "about",
                        "history",
                      ],
                      index,
                      content.about
                        .history
                        .length
                    )
                  }
                >
                  <Row gutter={12}>
                    <Col
                      xs={24}
                      md={5}
                    >
                      <Form.Item label="Year">
                        <Input
                          value={
                            item.year
                          }
                          onChange={(
                            event
                          ) =>
                            updateArrayItem(
                              [
                                "about",
                                "history",
                              ],
                              index,
                              "year",
                              event.target
                                .value
                            )
                          }
                        />
                      </Form.Item>
                    </Col>


                    <Col
                      xs={24}
                      md={19}
                    >
                      <Form.Item label="Title">
                        <Input
                          value={
                            item.title
                          }
                          onChange={(
                            event
                          ) =>
                            updateArrayItem(
                              [
                                "about",
                                "history",
                              ],
                              index,
                              "title",
                              event.target
                                .value
                            )
                          }
                        />
                      </Form.Item>
                    </Col>


                    <Col span={24}>
                      <Form.Item label="Description">
                        <Input.TextArea
                          rows={3}
                          value={
                            item.description
                          }
                          onChange={(
                            event
                          ) =>
                            updateArrayItem(
                              [
                                "about",
                                "history",
                              ],
                              index,
                              "description",
                              event.target
                                .value
                            )
                          }
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              )
            )}


            <Button
              icon={
                <PlusOutlined />
              }
              onClick={() =>
                addArrayItem(
                  [
                    "about",
                    "history",
                  ],
                  {
                    year:
                      "",
                    title:
                      "",
                    description:
                      "",
                  }
                )
              }
            >
              Add History Item
            </Button>


            <Divider>
              Core Values
            </Divider>


            {(
              content.about
                ?.values ||
              []
            ).map(
              (
                item,
                index
              ) => (
                <Row
                  gutter={12}
                  key={
                    index
                  }
                  style={{
                    marginBottom:
                      10,
                  }}
                >
                  <Col
                    xs={24}
                    md={7}
                  >
                    <Input
                      value={
                        item.title
                      }
                      placeholder="Value"
                      onChange={(
                        event
                      ) =>
                        updateArrayItem(
                          [
                            "about",
                            "values",
                          ],
                          index,
                          "title",
                          event.target
                            .value
                        )
                      }
                    />
                  </Col>


                  <Col
                    xs={24}
                    md={14}
                  >
                    <Input
                      value={
                        item.description
                      }
                      placeholder="Description"
                      onChange={(
                        event
                      ) =>
                        updateArrayItem(
                          [
                            "about",
                            "values",
                          ],
                          index,
                          "description",
                          event.target
                            .value
                        )
                      }
                    />
                  </Col>


                  <Col
                    xs={24}
                    md={3}
                  >
                    <Button
                      danger
                      icon={
                        <DeleteOutlined />
                      }
                      onClick={() =>
                        removeArrayItem(
                          [
                            "about",
                            "values",
                          ],
                          index
                        )
                      }
                    />
                  </Col>
                </Row>
              )
            )}


            <Button
              icon={
                <PlusOutlined />
              }
              onClick={() =>
                addArrayItem(
                  [
                    "about",
                    "values",
                  ],
                  {
                    title:
                      "",
                    description:
                      "",
                  }
                )
              }
            >
              Add Core Value
            </Button>
          </Card>


          <Card title="Principal Message">
            <Row gutter={16}>
              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Principal Name">
                  <Input
                    value={
                      content.principal
                        ?.name
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "principal",
                          "name",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Designation / Institution">
                  <Input
                    value={
                      content.principal
                        ?.designation
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "principal",
                          "designation",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>
            </Row>


            <Form.Item label="Heading">
              <Input
                value={
                  content.principal
                    ?.title
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "principal",
                      "title",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>


            <Form.Item label="Principal Message">
              <Input.TextArea
                rows={7}
                value={
                  content.principal
                    ?.message
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "principal",
                      "message",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>


            <Divider>
              Principal Picture
            </Divider>


            <InlineMediaField
              media={
                media
              }
              value={
                content.principal
                  ?.photo_media_id
              }
              category="PRINCIPAL"
              title="Principal Photograph"
              helpText="Principal message section mein use hone wali photograph."
              onChange={(
                value
              ) =>
                updateValue(
                  [
                    "principal",
                    "photo_media_id",
                  ],
                  value
                )
              }
              onUpload={
                uploadInlineMedia
              }
            />
          </Card>
        </Space>
      ),
    },


    /*
    |--------------------------------------------------------------------------
    | LEADERSHIP
    |--------------------------------------------------------------------------
    */

    {
      key:
        "leadership",

      label:
        "Leadership",

      children: (
        <Card
          title="Leadership Management"
          extra={
            <Button
              type="primary"
              icon={
                <PlusOutlined />
              }
              onClick={() =>
                addArrayItem(
                  [
                    "leadership",
                    "items",
                  ],
                  {
                    key:
                      `leader-${Date.now()}`,

                    short:
                      "",

                    designation:
                      "",

                    name:
                      "",

                    description:
                      "",

                    photo_media_id:
                      null,

                    is_active:
                      true,
                  }
                )
              }
            >
              Add Officer
            </Button>
          }
        >
          <Alert
            type="info"
            showIcon
            style={{
              marginBottom:
                18,
            }}
            message="Har officer ki picture usi officer card ke andar upload ki ja sakti hai."
          />


          {(
            content.leadership
              ?.items ||
            []
          ).map(
            (
              item,
              index
            ) => (
              <Card
                key={
                  item.key ||
                  index
                }
                size="small"
                className="public-cms-editor-card"
                title={`${
                  index +
                  1
                }. ${
                  item.designation ||
                  "New Officer"
                }`}
                extra={
                  reorderButtons(
                    [
                      "leadership",
                      "items",
                    ],
                    index,
                    content.leadership
                      .items
                      .length
                  )
                }
              >
                <Row gutter={12}>
                  <Col
                    xs={24}
                    md={4}
                  >
                    <Form.Item label="Short">
                      <Input
                        value={
                          item.short
                        }
                        onChange={(
                          event
                        ) =>
                          updateArrayItem(
                            [
                              "leadership",
                              "items",
                            ],
                            index,
                            "short",
                            event.target
                              .value
                          )
                        }
                      />
                    </Form.Item>
                  </Col>


                  <Col
                    xs={24}
                    md={8}
                  >
                    <Form.Item label="Designation">
                      <Input
                        value={
                          item.designation
                        }
                        onChange={(
                          event
                        ) =>
                          updateArrayItem(
                            [
                              "leadership",
                              "items",
                            ],
                            index,
                            "designation",
                            event.target
                              .value
                          )
                        }
                      />
                    </Form.Item>
                  </Col>


                  <Col
                    xs={24}
                    md={8}
                  >
                    <Form.Item label="Officer Name">
                      <Input
                        value={
                          item.name
                        }
                        onChange={(
                          event
                        ) =>
                          updateArrayItem(
                            [
                              "leadership",
                              "items",
                            ],
                            index,
                            "name",
                            event.target
                              .value
                          )
                        }
                      />
                    </Form.Item>
                  </Col>


                  <Col
                    xs={24}
                    md={4}
                  >
                    <Form.Item label="Visible">
                      <Switch
                        checked={
                          item.is_active !==
                          false
                        }
                        onChange={(
                          value
                        ) =>
                          updateArrayItem(
                            [
                              "leadership",
                              "items",
                            ],
                            index,
                            "is_active",
                            value
                          )
                        }
                      />
                    </Form.Item>
                  </Col>


                  <Col span={24}>
                    <Form.Item label="Description">
                      <Input.TextArea
                        rows={3}
                        value={
                          item.description
                        }
                        onChange={(
                          event
                        ) =>
                          updateArrayItem(
                            [
                              "leadership",
                              "items",
                            ],
                            index,
                            "description",
                            event.target
                              .value
                          )
                        }
                      />
                    </Form.Item>
                  </Col>
                </Row>


                <Divider>
                  {item.designation ||
                    "Officer"} Picture
                </Divider>


                <InlineMediaField
                  media={
                    media
                  }
                  value={
                    item.photo_media_id
                  }
                  category="LEADERSHIP"
                  title={`${
                    item.designation ||
                    "Officer"
                  } Photograph`}
                  onChange={(
                    value
                  ) =>
                    updateArrayItem(
                      [
                        "leadership",
                        "items",
                      ],
                      index,
                      "photo_media_id",
                      value
                    )
                  }
                  onUpload={
                    uploadInlineMedia
                  }
                />
              </Card>
            )
          )}
        </Card>
      ),
    },


    /*
    |--------------------------------------------------------------------------
    | TRAINING & FACILITIES
    |--------------------------------------------------------------------------
    */

    {
      key:
        "training",

      label:
        "Training & Facilities",

      children: (
        <Space
          direction="vertical"
          size="large"
          style={{
            width:
              "100%",
          }}
        >
          <Card
            title="Training Cards"
            extra={
              <Button
                icon={
                  <PlusOutlined />
                }
                onClick={() =>
                  addArrayItem(
                    [
                      "training",
                      "items",
                    ],
                    {
                      key:
                        `training-${Date.now()}`,

                      icon:
                        "TROPHY",

                      title:
                        "",

                      description:
                        "",

                      is_active:
                        true,
                    }
                  )
                }
              >
                Add Training Card
              </Button>
            }
          >
            {(
              content.training
                ?.items ||
              []
            ).map(
              (
                item,
                index
              ) => (
                <Card
                  size="small"
                  key={
                    item.key ||
                    index
                  }
                  className="public-cms-editor-card"
                  extra={
                    reorderButtons(
                      [
                        "training",
                        "items",
                      ],
                      index,
                      content.training
                        .items
                        .length
                    )
                  }
                >
                  <Row gutter={12}>
                    <Col
                      xs={24}
                      md={5}
                    >
                      <Form.Item label="Icon">
                        <Select
                          value={
                            item.icon
                          }
                          options={
                            ICON_OPTIONS
                          }
                          onChange={(
                            value
                          ) =>
                            updateArrayItem(
                              [
                                "training",
                                "items",
                              ],
                              index,
                              "icon",
                              value
                            )
                          }
                        />
                      </Form.Item>
                    </Col>


                    <Col
                      xs={24}
                      md={7}
                    >
                      <Form.Item label="Title">
                        <Input
                          value={
                            item.title
                          }
                          onChange={(
                            event
                          ) =>
                            updateArrayItem(
                              [
                                "training",
                                "items",
                              ],
                              index,
                              "title",
                              event.target
                                .value
                            )
                          }
                        />
                      </Form.Item>
                    </Col>


                    <Col
                      xs={24}
                      md={10}
                    >
                      <Form.Item label="Description">
                        <Input.TextArea
                          rows={2}
                          value={
                            item.description
                          }
                          onChange={(
                            event
                          ) =>
                            updateArrayItem(
                              [
                                "training",
                                "items",
                              ],
                              index,
                              "description",
                              event.target
                                .value
                            )
                          }
                        />
                      </Form.Item>
                    </Col>


                    <Col
                      xs={24}
                      md={2}
                    >
                      <Form.Item label="Show">
                        <Switch
                          checked={
                            item.is_active !==
                            false
                          }
                          onChange={(
                            value
                          ) =>
                            updateArrayItem(
                              [
                                "training",
                                "items",
                              ],
                              index,
                              "is_active",
                              value
                            )
                          }
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              )
            )}
          </Card>


          <Card
            title="Facilities"
            extra={
              <Button
                icon={
                  <PlusOutlined />
                }
                onClick={() =>
                  addArrayItem(
                    [
                      "facilities",
                      "items",
                    ],
                    {
                      key:
                        `facility-${Date.now()}`,

                      icon:
                        "BANK",

                      title:
                        "",

                      is_active:
                        true,
                    }
                  )
                }
              >
                Add Facility
              </Button>
            }
          >

            <Divider>
              Main Campus Picture
            </Divider>


            <InlineMediaField
              media={
                media
              }
              value={
                content.facilities
                  ?.main_media_id
              }
              category="FACILITY"
              title="Main Campus Picture"
              onChange={(
                value
              ) =>
                updateValue(
                  [
                    "facilities",
                    "main_media_id",
                  ],
                  value
                )
              }
              onUpload={
                uploadInlineMedia
              }
            />


            <Divider>
              Secondary Facility Picture
            </Divider>


            <InlineMediaField
              media={
                media
              }
              value={
                content.facilities
                  ?.secondary_media_id
              }
              category="FACILITY"
              title="Secondary Facility Picture"
              onChange={(
                value
              ) =>
                updateValue(
                  [
                    "facilities",
                    "secondary_media_id",
                  ],
                  value
                )
              }
              onUpload={
                uploadInlineMedia
              }
            />


            <Divider>
              Facility List
            </Divider>


            {(
              content.facilities
                ?.items ||
              []
            ).map(
              (
                item,
                index
              ) => (
                <Row
                  gutter={12}
                  align="middle"
                  key={
                    item.key ||
                    index
                  }
                  style={{
                    marginBottom:
                      10,
                  }}
                >
                  <Col
                    xs={24}
                    md={5}
                  >
                    <Select
                      style={{
                        width:
                          "100%",
                      }}
                      value={
                        item.icon
                      }
                      options={
                        ICON_OPTIONS
                      }
                      onChange={(
                        value
                      ) =>
                        updateArrayItem(
                          [
                            "facilities",
                            "items",
                          ],
                          index,
                          "icon",
                          value
                        )
                      }
                    />
                  </Col>


                  <Col
                    xs={24}
                    md={13}
                  >
                    <Input
                      value={
                        item.title
                      }
                      onChange={(
                        event
                      ) =>
                        updateArrayItem(
                          [
                            "facilities",
                            "items",
                          ],
                          index,
                          "title",
                          event.target
                            .value
                        )
                      }
                    />
                  </Col>


                  <Col
                    xs={24}
                    md={2}
                  >
                    <Switch
                      checked={
                        item.is_active !==
                        false
                      }
                      onChange={(
                        value
                      ) =>
                        updateArrayItem(
                          [
                            "facilities",
                            "items",
                          ],
                          index,
                          "is_active",
                          value
                        )
                      }
                    />
                  </Col>


                  <Col
                    xs={24}
                    md={4}
                  >
                    {reorderButtons(
                      [
                        "facilities",
                        "items",
                      ],
                      index,
                      content.facilities
                        .items
                        .length
                    )}
                  </Col>
                </Row>
              )
            )}
          </Card>
        </Space>
      ),
    },


    /*
    |--------------------------------------------------------------------------
    | GALLERY
    |--------------------------------------------------------------------------
    */

    {
      key:
        "gallery",

      label:
        "Gallery",

      children: (
        <Space
          direction="vertical"
          size="large"
          style={{
            width:
              "100%",
          }}
        >
          <Card title="Gallery Information">
            <Form.Item label="Gallery Title">
              <Input
                value={
                  content.gallery
                    ?.title
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "gallery",
                      "title",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>


            <Form.Item label="Gallery Description">
              <Input.TextArea
                rows={3}
                value={
                  content.gallery
                    ?.description
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "gallery",
                      "description",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>
          </Card>


          <Card title="Add Picture To Gallery">
            <Alert
              type="info"
              showIcon
              style={{
                marginBottom:
                  16,
              }}
              message="Gallery ki picture yahin se directly upload karein."
            />


            <Row gutter={12}>
              <Col
                xs={24}
                md={10}
              >
                <Form.Item label="Picture Title">
                  <Input
                    value={
                      galleryTitle
                    }
                    placeholder="e.g. Parade Ground"
                    onChange={(
                      event
                    ) =>
                      setGalleryTitle(
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={14}
              >
                <Form.Item label="Caption">
                  <Input
                    value={
                      galleryCaption
                    }
                    placeholder="Optional short description"
                    onChange={(
                      event
                    ) =>
                      setGalleryCaption(
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>
            </Row>


            <Upload
              showUploadList={
                false
              }
              customRequest={
                uploadGalleryMedia
              }
              accept=".jpg,.jpeg,.png,.webp"
            >
              <Button
                type="primary"
                size="large"
                icon={
                  <UploadOutlined />
                }
              >
                Upload Gallery Picture
              </Button>
            </Upload>
          </Card>


          <Card
            title={`Gallery Pictures (${galleryMedia.length})`}
          >
            <div className="public-cms-media-grid">
              {galleryMedia.map(
                (
                  item
                ) => (
                  <Card
                    key={
                      item.id
                    }
                    size="small"
                    className="public-cms-media-card"
                    cover={
                      <Image
                        src={
                          mediaUrl(
                            item
                          )
                        }
                        height={
                          180
                        }
                        preview
                        style={{
                          objectFit:
                            "cover",

                          width:
                            "100%",
                        }}
                      />
                    }
                  >
                    <Space
                      direction="vertical"
                      size={7}
                      style={{
                        width:
                          "100%",
                      }}
                    >
                      <Text strong>
                        {item.title ||
                          `Picture #${item.id}`}
                      </Text>


                      {item.caption && (
                        <Text
                          type="secondary"
                        >
                          {
                            item.caption
                          }
                        </Text>
                      )}


                      <Space wrap>
                        <Tag
                          color={
                            item.is_active
                              ? "green"
                              : "default"
                          }
                        >
                          {item.is_active
                            ? "Visible"
                            : "Hidden"}
                        </Tag>


                        <Button
                          size="small"
                          icon={
                            <EditOutlined />
                          }
                          onClick={() =>
                            openMediaEdit(
                              item
                            )
                          }
                        >
                          Edit
                        </Button>


                        <Upload
                          showUploadList={
                            false
                          }
                          customRequest={
                            replaceMedia(
                              item
                            )
                          }
                          accept=".jpg,.jpeg,.png,.webp"
                        >
                          <Button
                            size="small"
                            icon={
                              <ReloadOutlined />
                            }
                          >
                            Replace Picture
                          </Button>
                        </Upload>


                        <Button
                          size="small"
                          danger
                          icon={
                            <DeleteOutlined />
                          }
                          onClick={() =>
                            deleteMedia(
                              item
                            )
                          }
                        >
                          Delete
                        </Button>
                      </Space>
                    </Space>
                  </Card>
                )
              )}
            </div>


            {!galleryMedia.length && (
              <div className="public-cms-empty">
                <FileImageOutlined />

                <Text type="secondary">
                  Gallery mein abhi koi picture nahi hai.
                </Text>
              </div>
            )}
          </Card>
        </Space>
      ),
    },


    /*
    |--------------------------------------------------------------------------
    | CONTACT
    |--------------------------------------------------------------------------
    */

    {
      key:
        "contact",

      label:
        "Contact",

      children: (
        <Space
          direction="vertical"
          size="large"
          style={{
            width:
              "100%",
          }}
        >
          <Card title="Contact Information">
            <Row gutter={16}>
              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Location">
                  <Input
                    value={
                      content.contact
                        ?.location
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "contact",
                          "location",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col xs={24} md={12}>
                <Form.Item
                  label="Google Maps Location Link"
                  validateStatus={content.contact?.location_map_url?.trim() && !resolvePublicGoogleMapsUrl(content.contact.location_map_url) ? "warning" : undefined}
                  help={content.contact?.location_map_url?.trim() && !resolvePublicGoogleMapsUrl(content.contact.location_map_url) ? "Enter a valid HTTPS Google Maps location link. Other links will not be clickable on the public site." : undefined}
                  extra="Use Share > Copy link in Google Maps (https://maps.app.goo.gl/... or https://www.google.com/maps/...). Leave empty to display plain location text."
                >
                  <Input
                    placeholder="https://maps.app.goo.gl/..."
                    value={content.contact?.location_map_url || ""}
                    onChange={(event) => updateValue(["contact", "location_map_url"], event.target.value)}
                    maxLength={1000}
                  />
                </Form.Item>
              </Col>

              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Phone">
                  <Input
                    value={
                      content.contact
                        ?.phone
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "contact",
                          "phone",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Email">
                  <Input
                    value={
                      content.contact
                        ?.email
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "contact",
                          "email",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col
                xs={24}
                md={12}
              >
                <Form.Item label="Visitor / Office Hours">
                  <Input
                    value={
                      content.contact
                        ?.visitor_hours
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "contact",
                          "visitor_hours",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>


              <Col span={24}>
                <Form.Item label="Description">
                  <Input.TextArea
                    rows={4}
                    value={
                      content.contact
                        ?.description
                    }
                    onChange={(
                      event
                    ) =>
                      updateValue(
                        [
                          "contact",
                          "description",
                        ],
                        event.target
                          .value
                      )
                    }
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>


          <Card title="Footer">
            <Form.Item label="Footer School Name">
              <Input
                value={
                  content.footer
                    ?.school_name
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "footer",
                      "school_name",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>


            <Form.Item label="Footer Department">
              <Input
                value={
                  content.footer
                    ?.department
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "footer",
                      "department",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>


            <Form.Item label="Footer Motto">
              <Input
                value={
                  content.footer
                    ?.motto
                }
                onChange={(
                  event
                ) =>
                  updateValue(
                    [
                      "footer",
                      "motto",
                    ],
                    event.target
                      .value
                  )
                }
              />
            </Form.Item>
          </Card>
        </Space>
      ),
    },


    /*
    |--------------------------------------------------------------------------
    | MEDIA LIBRARY
    |--------------------------------------------------------------------------
    */

    {
      key:
        "media-library",

      label:
        "Media Library",

      children: (
        <Card
          title={`Complete Media Library (${media.length})`}
        >
          <Alert
            type="info"
            showIcon
            style={{
              marginBottom:
                16,
            }}
            message="Normally picture upload karne ke liye Media Library mein aane ki zarurat nahi. Pictures ab relevant section ke andar se direct upload hoti hain."
          />


          <div className="public-cms-media-grid">
            {media.map(
              (
                item
              ) => (
                <Card
                  key={
                    item.id
                  }
                  size="small"
                  className="public-cms-media-card"
                  cover={
                    item.media_type ===
                    "VIDEO"
                      ? (
                        <video
                          src={
                            mediaUrl(
                              item
                            )
                          }
                          controls
                          preload="metadata"
                          className="public-cms-media-preview"
                        />
                      )
                      : (
                        <Image
                          src={
                            mediaUrl(
                              item
                            )
                          }
                          height={
                            170
                          }
                          preview
                          style={{
                            objectFit:
                              "cover",

                            width:
                              "100%",
                          }}
                        />
                      )
                  }
                >
                  <Space
                    direction="vertical"
                    size={7}
                    style={{
                      width:
                        "100%",
                    }}
                  >
                    <Text strong>
                      {item.title ||
                        `Media #${item.id}`}
                    </Text>


                    <Space wrap>
                      <Tag>
                        {
                          item.category
                        }
                      </Tag>

                      <Tag
                        color={
                          item.is_active
                            ? "green"
                            : "default"
                        }
                      >
                        {item.is_active
                          ? "Active"
                          : "Hidden"}
                      </Tag>

                      <Tag>
                        {
                          item.media_type
                        }
                      </Tag>
                    </Space>


                    <Space wrap>
                      <Button
                        size="small"
                        icon={
                          <EditOutlined />
                        }
                        onClick={() =>
                          openMediaEdit(
                            item
                          )
                        }
                      >
                        Edit
                      </Button>


                      <Upload
                        showUploadList={
                          false
                        }
                        customRequest={
                          replaceMedia(
                            item
                          )
                        }
                        accept=".jpg,.jpeg,.png,.webp,.mp4,.webm"
                      >
                        <Button
                          size="small"
                          icon={
                            <ReloadOutlined />
                          }
                        >
                          Replace
                        </Button>
                      </Upload>


                      <Button
                        size="small"
                        danger
                        icon={
                          <DeleteOutlined />
                        }
                        onClick={() =>
                          deleteMedia(
                            item
                          )
                        }
                      >
                        Delete
                      </Button>
                    </Space>
                  </Space>
                </Card>
              )
            )}
          </div>
        </Card>
      ),
    },
  ];


  /*
  |--------------------------------------------------------------------------
  | PAGE
  |--------------------------------------------------------------------------
  */

  return (
    <div className="public-cms-page">

      <div className="public-cms-sticky-header">

        <div className="public-cms-heading">
          <div>
            <Title
              level={3}
              style={{
                margin:
                  0,
              }}
            >
              Public Website Management
            </Title>

            <Text type="secondary">
              Manage website information and pictures directly from their relevant sections.
            </Text>
          </div>


          <div className="public-cms-save-status">
            {isDirty ? (
              <Tag
                color="orange"
                icon={
                  <WarningOutlined />
                }
              >
                Unsaved Changes
              </Tag>
            ) : (
              <Tag
                color="green"
                icon={
                  <CheckCircleOutlined />
                }
              >
                Saved
              </Tag>
            )}
          </div>
        </div>


        <Space wrap>

          <Button
            icon={
              <ReloadOutlined />
            }
            onClick={
              refreshWebsiteData
            }
          >
            Refresh
          </Button>


          <Button
            disabled={
              !isDirty
            }
            onClick={
              discardChanges
            }
          >
            Discard
          </Button>


          <Button
            icon={
              <EyeOutlined />
            }
            onClick={
              openPreview
            }
          >
            Preview
          </Button>


          <Button
            type="primary"
            ghost
            icon={
              <EyeOutlined />
            }
            loading={
              saving
            }
            onClick={
              saveAndPreview
            }
          >
            Save & Preview
          </Button>


          <Button
            type="primary"
            icon={
              <SaveOutlined />
            }
            loading={
              saving
            }
            disabled={
              !isDirty
            }
            onClick={() =>
              saveContent()
            }
          >
            Save Website
          </Button>

        </Space>
      </div>


      <Alert
        type="info"
        showIcon
        className="public-cms-main-alert"
        message="Picture upload is available directly within the relevant section."
        description="Uploaded pictures are automatically selected for this section. Press 'Save Website' to publish them to the public homepage."
      />


      <Tabs
        activeKey={
          activeTab
        }
        onChange={
          setActiveTab
        }
        items={
          tabs
        }
        type="card"
        className="public-cms-tabs"
      />


      {/* MEDIA EDIT */}

      <Modal
        title="Edit Media"
        open={
          mediaModalOpen
        }
        onCancel={() =>
          setMediaModalOpen(
            false
          )
        }
        onOk={
          saveMediaEdit
        }
        confirmLoading={
          saving
        }
        okText="Save Media"
      >
        <Form
          form={
            mediaForm
          }
          layout="vertical"
        >
          <Form.Item
            name="title"
            label="Title"
          >
            <Input />
          </Form.Item>


          <Form.Item
            name="caption"
            label="Caption"
          >
            <Input.TextArea
              rows={3}
            />
          </Form.Item>


          <Form.Item
            name="category"
            label="Category"
          >
            <Select
              options={
                MEDIA_CATEGORIES.map(
                  (
                    value
                  ) => ({
                    value,
                    label:
                      value,
                  })
                )
              }
            />
          </Form.Item>


          <Form.Item
            name="sort_order"
            label="Sort Order"
          >
            <InputNumber
              style={{
                width:
                  "100%",
              }}
            />
          </Form.Item>


          <Form.Item
            name="is_active"
            label="Visible / Active"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  );
}